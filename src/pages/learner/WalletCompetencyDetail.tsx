import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Download,
  Flag,
  GraduationCap,
  Hash,
  Link2,
  PenLine,
  UserRound,
} from "lucide-react";
import { LearnerWorkspaceShell } from "@/components/sijil/LearnerWorkspaceShell";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { EmptyState } from "@/components/sijil/EmptyState";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useCredentials } from "@/hooks/useLearnerData";
import { toast } from "@/hooks/use-toast";
import {
  fetchWalletCompetencyRecords,
  type WalletCompetencyRecordView,
} from "@/lib/db/wallet-competency-records";
import {
  getWalletCompetenciesApi,
  getWalletCompetencyApi,
  revokeWalletShareApi,
  shareWalletCompetencyApi,
  type WalletShareRecordView,
} from "@/services/api/wallet.api";
import "./wallet-competency-detail.css";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${day} • ${time}`;
}

function slugSkill(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12) || "skill";
}

function shortId(value: string): string {
  const clean = value.replace(/[^a-zA-Z0-9]/g, "");
  if (clean.length <= 8) return clean || "0000";
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

function buildCredentialId(competencyName: string, competencyId: string, credentialId?: string | null): string {
  if (credentialId) {
    const raw = credentialId.replace(/^https?:\/\//, "");
    if (raw.length > 28) return `${raw.slice(0, 18)}...${raw.slice(-4)}`;
    return raw;
  }
  return `cred:${slugSkill(competencyName)}:${shortId(competencyId)}`;
}

function matchingCredential<T extends { skill: string; name: string }>(
  credentials: T[],
  competencyName: string,
): T | undefined {
  const target = competencyName.trim().toLowerCase();
  return credentials.find(
    (credential) =>
      credential.skill.trim().toLowerCase() === target
      || credential.name.trim().toLowerCase() === target,
  );
}

function GithubMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.586 2 12.223c0 4.515 2.865 8.342 6.839 9.694.5.094.683-.222.683-.482 0-.237-.009-.866-.014-1.7-2.782.62-3.369-1.374-3.369-1.374-.455-1.185-1.11-1.5-1.11-1.5-.908-.638.069-.625.069-.625 1.004.072 1.532 1.057 1.532 1.057.892 1.568 2.341 1.115 2.91.853.091-.663.35-1.115.636-1.372-2.22-.259-4.555-1.14-4.555-5.077 0-1.122.39-2.04 1.029-2.759-.103-.26-.446-1.304.098-2.718 0 0 .84-.276 2.75 1.054A9.35 9.35 0 0 1 12 6.91a9.35 9.35 0 0 1 2.504.346c1.909-1.33 2.748-1.054 2.748-1.054.546 1.414.203 2.458.1 2.718.64.719 1.028 1.637 1.028 2.759 0 3.947-2.338 4.815-4.566 5.069.359.317.679.943.679 1.901 0 1.372-.012 2.478-.012 2.815 0 .263.18.58.688.481C19.138 20.561 22 16.735 22 12.223 22 6.586 17.523 2 12 2Z" />
    </svg>
  );
}

export default function WalletCompetencyDetail() {
  const { competencyId: rawId } = useParams();
  const competencyId = decodeURIComponent(rawId || "");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { credentials, loading: credentialsLoading } = useCredentials();

  const [record, setRecord] = useState<WalletCompetencyRecordView | null>(null);
  const [shares, setShares] = useState<WalletShareRecordView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.id || !competencyId) {
        setRecord(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [derived, apiList, detail] = await Promise.all([
          fetchWalletCompetencyRecords(user.id),
          getWalletCompetenciesApi(),
          getWalletCompetencyApi(competencyId),
        ]);
        if (cancelled) return;
        const merged = apiList?.length
          ? [
              ...apiList.map((row) => derived.find((d) => d.competencyId === row.competencyId) ?? row),
              ...derived.filter((row) => !apiList.some((item) => item.competencyId === row.competencyId)),
            ]
          : derived;
        const found =
          detail?.record
          ?? merged.find((row) => row.competencyId === competencyId)
          ?? null;
        setRecord(found);
        setShares(detail?.shares ?? []);
        if (!found) setError("This skill competency was not found in your wallet.");
      } catch (nextError: unknown) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Could not load competency detail.");
          setRecord(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, competencyId]);

  const issuedCredential = useMemo(
    () => (record ? matchingCredential(credentials, record.competencyName) : undefined),
    [credentials, record],
  );

  const activeShare = useMemo(
    () => shares.find((share) => share.shareStatus === "Active") ?? null,
    [shares],
  );

  const recruiterShared = useMemo(
    () => shares.some((share) => share.shareStatus === "Active" && Boolean(share.recipientName || share.recipientOrganization)),
    [shares],
  );

  const signed = Boolean(issuedCredential?.proof || issuedCredential?.verification === "Verified" || issuedCredential);
  const issueDate = issuedCredential?.validFrom ?? record?.createdAt ?? null;
  const credentialIdLabel = record
    ? buildCredentialId(record.competencyName, record.competencyId, issuedCredential?.id)
    : "—";

  const issuedAt = record?.createdAt ?? null;
  const signedAt = issuedCredential?.validFrom ?? (signed ? record?.updatedAt : null);
  const finalizedAt = signed
    ? (issuedCredential?.anchoredAt ?? issuedCredential?.validFrom ?? record?.updatedAt ?? null)
    : null;

  const refreshShares = async () => {
    if (!competencyId) return;
    const detail = await getWalletCompetencyApi(competencyId);
    if (detail) setShares(detail.shares);
  };

  const handleDownload = () => {
    if (!record) return;
    const payload = {
      type: "SIJILCompetencyCredential",
      competencyId: record.competencyId,
      competencyName: record.competencyName,
      issuer: "SIJIL",
      issuedAt: issueDate,
      credentialId: credentialIdLabel,
      signed,
      evidencePackage: record.evidencePackage,
      credential: issuedCredential ?? null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugSkill(record.competencyName)}-competency-credential.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast({ title: "Credential downloaded", description: "Saved as a JSON credential file." });
  };

  const handleAccessLinkToggle = async (next: boolean) => {
    if (!record || linkBusy) return;
    setLinkBusy(true);
    try {
      if (next) {
        await shareWalletCompetencyApi({
          competencyId: record.competencyId,
          selectionMode: "verification_summary",
          selectedFields: [
            "competency_name",
            "competency_domain",
            "verification_status",
            "practical_task_result",
            "timestamps",
          ],
          shareScope: "selected",
          expiresInDays: 30,
        });
        await refreshShares();
        toast({ title: "Access link enabled", description: "Anyone with the link can view this credential." });
      } else if (activeShare) {
        const ok = await revokeWalletShareApi(activeShare.id);
        if (!ok) throw new Error("Could not disable access link.");
        await refreshShares();
        toast({ title: "Access link disabled", description: "The public link is no longer active." });
      }
    } catch (toggleError: unknown) {
      toast({
        title: "Could not update access link",
        description: toggleError instanceof Error ? toggleError.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLinkBusy(false);
    }
  };

  if (loading || credentialsLoading) {
    return (
      <LearnerWorkspaceShell variant="dashboard">
        <PageSkeleton rows={6} />
      </LearnerWorkspaceShell>
    );
  }

  if (!record) {
    return (
      <LearnerWorkspaceShell variant="dashboard">
        <div className="scd-page">
          <button type="button" className="scd-back" onClick={() => navigate("/learner/wallet")}>
            <ArrowLeft className="h-4 w-4" />
            Back to Wallet
          </button>
          <EmptyState
            icon={ClipboardList}
            title="Skill not found"
            description={error ?? "This competency is not in your wallet."}
          />
        </div>
      </LearnerWorkspaceShell>
    );
  }

  return (
    <LearnerWorkspaceShell variant="dashboard">
      <div className="scd-page">
        <button type="button" className="scd-back" onClick={() => navigate("/learner/wallet")}>
          <ArrowLeft className="h-4 w-4" />
          Back to Wallet
        </button>

        <div className="scd-grid">
          <article className="scd-card scd-hero" aria-label={`${record.competencyName} competency credential`}>
            <div className="scd-hero-top">
              <div className="scd-hero-identity">
                <div className="scd-hero-icon" aria-hidden="true">{"</>"}</div>
                <div className="min-w-0">
                  <h1 className="scd-hero-title">{record.competencyName} – Competency</h1>
                  <p className="scd-hero-subtitle">
                    Demonstrates your learning and practical skill in {record.competencyName}.
                  </p>
                </div>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="scd-download" onClick={handleDownload} aria-label="Download Credential">
                    <Download className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Download Credential</TooltipContent>
              </Tooltip>
            </div>

            <div className="scd-meta">
              <div className="scd-meta-item">
                <span className="scd-meta-icon"><CalendarDays className="h-4 w-4" /></span>
                <div>
                  <p className="scd-meta-label">Issue Date</p>
                  <p className="scd-meta-value">{formatDate(issueDate)}</p>
                </div>
              </div>
              <div className="scd-meta-item">
                <span className="scd-meta-icon"><Hash className="h-4 w-4" /></span>
                <div>
                  <p className="scd-meta-label">Credential ID</p>
                  <p className="scd-meta-value">{credentialIdLabel}</p>
                </div>
              </div>
              <div className="scd-meta-item">
                <span className="scd-meta-icon"><Building2 className="h-4 w-4" /></span>
                <div>
                  <p className="scd-meta-label">Issuer</p>
                  <p className="scd-meta-value">SIJIL</p>
                </div>
              </div>
            </div>

            <div className="scd-signature">
              <span className="scd-signature-label">
                <Link2 className="h-4 w-4" />
                Digital Signature
              </span>
              {signed ? (
                <span className="scd-signed-pill">
                  <Check className="h-3.5 w-3.5" />
                  Signed
                </span>
              ) : (
                <span className="scd-unsigned-pill">Pending</span>
              )}
            </div>
          </article>

          <aside className="scd-card scd-panel" aria-label="Credential timeline">
            <h2 className="scd-panel-title">Credential Timeline</h2>
            <ol className="scd-timeline">
              <li className="scd-timeline-item">
                <span className="scd-timeline-icon"><CalendarDays className="h-4 w-4" /></span>
                <div>
                  <p className="scd-timeline-title">Credential Issued</p>
                  <p className="scd-timeline-desc">Your learning record was created.</p>
                  <p className="scd-timeline-time">{formatDateTime(issuedAt)}</p>
                </div>
              </li>
              <li className="scd-timeline-item">
                <span className="scd-timeline-icon"><PenLine className="h-4 w-4" /></span>
                <div>
                  <p className="scd-timeline-title">Digitally Signed</p>
                  <p className="scd-timeline-desc">You signed this credential with your digital identity.</p>
                  <p className="scd-timeline-time">{signedAt ? formatDateTime(signedAt) : "Awaiting signature"}</p>
                </div>
              </li>
              <li className="scd-timeline-item">
                <span className="scd-timeline-icon"><Flag className="h-4 w-4" /></span>
                <div>
                  <p className="scd-timeline-title">Finalized</p>
                  <p className="scd-timeline-desc">Your credential is ready to share.</p>
                  <p className="scd-timeline-time">{finalizedAt ? formatDateTime(finalizedAt) : "Not finalized yet"}</p>
                </div>
              </li>
            </ol>
          </aside>

          <section className="scd-card scd-panel" aria-label="Evidence sources">
            <h2 className="scd-panel-title">Evidence Sources (3)</h2>
            <ul className="scd-evidence-list">
              <li>
                <button type="button" className="scd-row" onClick={() => navigate("/learner/integrations")}>
                  <span className="scd-row-icon github"><GithubMark className="h-5 w-5" /></span>
                  <span className="scd-row-copy">
                    <p className="scd-row-title">GitHub</p>
                    <p className="scd-row-desc">Code, projects and commits.</p>
                  </span>
                  <ChevronRight className="scd-chevron h-4 w-4" />
                </button>
              </li>
              <li>
                <button type="button" className="scd-row" onClick={() => navigate("/learner/integrations")}>
                  <span className="scd-row-icon moodle"><GraduationCap className="h-5 w-5" /></span>
                  <span className="scd-row-copy">
                    <p className="scd-row-title">Moodle (LMS)</p>
                    <p className="scd-row-desc">Course progress and results.</p>
                  </span>
                  <ChevronRight className="scd-chevron h-4 w-4" />
                </button>
              </li>
              <li>
                <button type="button" className="scd-row" onClick={() => navigate("/learner/task")}>
                  <span className="scd-row-icon task"><ClipboardList className="h-5 w-5" /></span>
                  <span className="scd-row-copy">
                    <p className="scd-row-title">Practical Task</p>
                    <p className="scd-row-desc">Task submission and score.</p>
                  </span>
                  <ChevronRight className="scd-chevron h-4 w-4" />
                </button>
              </li>
            </ul>
          </section>

          <section className="scd-card scd-panel" aria-label="Sharing and access">
            <h2 className="scd-panel-title">Sharing & Access</h2>
            <p className="scd-panel-subtitle">Control how this credential is shared and accessed.</p>
            <ul className="scd-share-list">
              <li>
                <button
                  type="button"
                  className="scd-row"
                  onClick={() => navigate("/learner/wallet?panel=share")}
                >
                  <span className="scd-row-icon share"><UserRound className="h-5 w-5" /></span>
                  <span className="scd-row-copy">
                    <p className="scd-row-title">Share with Recruiter</p>
                    <p className="scd-row-desc">Send this credential to a recruiter or organization.</p>
                  </span>
                  <span className={recruiterShared || activeShare ? "scd-shared" : "scd-not-shared"}>
                    {recruiterShared || activeShare ? "Shared" : "Not Shared"}
                  </span>
                  <ChevronRight className="scd-chevron h-4 w-4" />
                </button>
              </li>
              <li>
                <div className="scd-row scd-link-row">
                  <span className="scd-row-icon link"><Link2 className="h-5 w-5" /></span>
                  <span className="scd-row-copy">
                    <p className="scd-row-title">Credential Access Link</p>
                    <p className="scd-row-desc">A link to view and verify this credential online.</p>
                    {activeShare ? (
                      <p className="scd-row-meta">Created: {formatDateTime(activeShare.createdAt)}</p>
                    ) : (
                      <p className="scd-row-meta">No active link</p>
                    )}
                  </span>
                  <Switch
                    className="scd-switch"
                    checked={Boolean(activeShare)}
                    disabled={linkBusy}
                    onCheckedChange={(checked) => void handleAccessLinkToggle(checked)}
                    aria-label="Toggle credential access link"
                  />
                </div>
              </li>
            </ul>
          </section>
        </div>
      </div>

    </LearnerWorkspaceShell>
  );
}
