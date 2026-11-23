import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Check,
  ChevronRight,
  Clock3,
  ClipboardList,
  Copy,
  FileText,
  Github,
  GraduationCap,
  Info,
  Landmark,
  Laptop,
  Layers,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { toast } from "@/hooks/use-toast";
import { useDeclaredSkills } from "@/hooks/useLearnerData";
import { useSsiIdentity } from "@/hooks/useSsiIdentity";
import { issueCredentialForSkill, type CredentialView } from "@/lib/db/credentials";
import { buildAllValidationSummaries, type ValidationSummary } from "@/lib/db/validation";
import { ApiUnavailableError, apiRequest } from "@/services/api/client";
import "./verified-proof-flow.css";

export type ProofStatus = "issued" | "eligible" | "pending";

export type ProofItem = {
  skillId: string;
  skill: string;
  status: ProofStatus;
  stageLabel: string;
  evidence: string;
  institution: string;
  nextStep: string;
  sources: string[];
  result: string;
  pipelineStage: string;
  issuedAt: string | null;
  credentialId: string | null;
  githubCount: number;
  lmsCount: number;
  taskCount: number;
  reviewCount: number;
};

const REVIEW_NOTE =
  "Peer reviews are optional. SIJIL checks the required evidence before issuing a credential.";

export function proofStatusForSkill(
  summary: { skill: string; pipelineStage: string },
  credentials: { skill: string; name: string }[],
): ProofStatus {
  const issued = credentials.some((credential) => credential.skill === summary.skill || credential.name === summary.skill);
  if (issued) return "issued";
  if (summary.pipelineStage === "wallet_ready" || summary.pipelineStage === "in_wallet") return "eligible";
  return "pending";
}

function matchingCredential<T extends { skill: string; name: string }>(
  credentials: T[],
  skill: string,
): T | undefined {
  return credentials.find((credential) => credential.skill === skill || credential.name === skill);
}

function countRows(rows: ValidationSummary["rows"], matcher: (type: string) => boolean): number {
  return rows.filter((row) => matcher(row.type.toLowerCase())).length;
}

export function toProofItem(
  summary: ValidationSummary,
  credentials: { skill: string; name: string; validFrom?: string; id?: string }[],
): ProofItem {
  const matched = matchingCredential(credentials, summary.skill);
  const githubCount = countRows(summary.rows, (type) => type.includes("github") || type.includes("repo"));
  const lmsCount = countRows(summary.rows, (type) => type.includes("moodle") || type.includes("lms") || type.includes("course"));
  const taskCount = countRows(summary.rows, (type) => type.includes("practical") || type.includes("task") || type.includes("assessment"));
  return {
    skillId: summary.skillId,
    skill: summary.skill,
    status: proofStatusForSkill(summary, credentials),
    stageLabel: summary.currentStageLabel,
    evidence: summary.evidence,
    institution: "SIJIL",
    nextStep: summary.nextStep,
    sources: summary.sources,
    result: summary.result,
    pipelineStage: summary.pipelineStage,
    issuedAt: matched?.validFrom ?? null,
    credentialId: matched?.id ?? null,
    githubCount: githubCount || (summary.sources.some((source) => /github/i.test(source)) ? 1 : 0),
    lmsCount: lmsCount || (summary.sources.some((source) => /moodle|lms/i.test(source)) ? 1 : 0),
    taskCount: taskCount || (summary.assessmentCompleted || summary.sources.some((source) => /practical|task/i.test(source)) ? 1 : 0),
    reviewCount: summary.reviewCount ?? 0,
  };
}

type Step = "choose" | "review" | "confirm" | "success";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function shortDid(did: string): string {
  if (did.length <= 22) return did;
  return `${did.slice(0, 12)}...${did.slice(-6)}`;
}

function slugSkill(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12) || "skill";
}

function previewCredentialId(skill: string, skillId: string, credentialId?: string | null): string {
  if (credentialId) {
    const raw = credentialId.replace(/^https?:\/\//, "");
    if (raw.length > 28) return `${raw.slice(0, 18)}...${raw.slice(-4)}`;
    return raw;
  }
  const clean = skillId.replace(/[^a-zA-Z0-9]/g, "");
  const hint = clean.length > 8 ? `${clean.slice(0, 4)}...${clean.slice(-4)}` : clean || "0000";
  return `cred:${slugSkill(skill)}:${hint}`;
}

function friendlySources(sources: string[]): string {
  if (!sources.length || sources.includes("No evidence yet")) {
    return "GitHub, Moodle (LMS), Practical Task";
  }
  const mapped = sources.map((source) => {
    const lower = source.toLowerCase();
    if (lower.includes("github")) return "GitHub";
    if (lower.includes("moodle") || lower.includes("lms")) return "Moodle (LMS)";
    if (lower.includes("practical") || lower.includes("task") || lower.includes("assessment")) return "Practical Task";
    if (lower.includes("upload")) return "Upload";
    return source;
  });
  return [...new Set(mapped)].join(", ");
}

function sourceCount(sources: string[]): number {
  if (!sources.length || sources.includes("No evidence yet")) return 3;
  return Math.max(1, new Set(friendlySources(sources).split(", ")).size);
}

export function VerifiedProofGuide({
  items,
  loading,
  holderDid,
  learnerName,
  onBack,
  onViewInWallet,
  onIssue,
  identityUnlocked,
  onUnlock,
}: {
  items: ProofItem[];
  loading: boolean;
  holderDid?: string | null;
  learnerName?: string | null;
  onBack: () => void;
  onViewInWallet: (skillId: string) => void;
  onIssue: (skillId: string) => Promise<CredentialView | null>;
  identityUnlocked: boolean;
  onUnlock?: (password: string) => Promise<void>;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("choose");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; issuer: string; skillId: string } | null>(null);

  const selected = items.find((item) => item.skillId === selectedId) ?? null;
  const progress = step === "success" ? 3 : step === "confirm" ? 2 : step === "review" ? 1 : 0;
  const displayName = (learnerName || "Learner").trim() || "Learner";

  const groups = useMemo(() => ({
    issued: items.filter((item) => item.status === "issued"),
    eligible: items.filter((item) => item.status === "eligible"),
    pending: items.filter((item) => item.status === "pending"),
  }), [items]);

  const confirmIssue = async () => {
    if (!selected || selected.status !== "eligible" || issuing || !identityUnlocked) return;
    setIssuing(true);
    setError(null);
    try {
      const created = await onIssue(selected.skillId);
      if (!created?.id) {
        setError("SIJIL did not return a credential. Check your achievements before requesting it again.");
        return;
      }
      setIssued({ name: selected.skill, issuer: created.issuer || "SIJIL", skillId: selected.skillId });
      setStep("success");
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : "Could not issue credential.");
    } finally {
      setIssuing(false);
    }
  };

  const copyDid = async () => {
    if (!holderDid) return;
    try {
      await navigator.clipboard.writeText(holderDid);
      toast({ title: "Wallet ID copied" });
    } catch {
      toast({ title: "Could not copy Wallet ID", variant: "destructive" });
    }
  };

  const unlockPrompt = (
    <div className="vpf-warn mt-3">
      <p className="font-semibold">Unlock your identity to issue this credential.</p>
      {onUnlock ? (
        showUnlock ? (
          <form className="mt-3 grid gap-2" onSubmit={async (event) => {
            event.preventDefault();
            if (unlocking || password.length < 10) return;
            setUnlocking(true);
            setUnlockError(null);
            try {
              await onUnlock(password);
              setPassword("");
              setShowUnlock(false);
            } catch {
              setUnlockError("Could not unlock your identity. Check your recovery password and try again.");
            } finally {
              setUnlocking(false);
            }
          }}>
            <label htmlFor="issue-unlock-password">Recovery password</label>
            <PasswordInput id="issue-unlock-password" value={password} onChange={setPassword} disabled={unlocking} />
            {unlockError ? <p role="alert">{unlockError}</p> : null}
            <button type="submit" className="vpf-btn vpf-btn-primary" disabled={unlocking || password.length < 10}>
              {unlocking ? "Unlocking…" : "Unlock Identity"}
            </button>
          </form>
        ) : (
          <button type="button" className="vpf-btn vpf-btn-primary mt-3" onClick={() => setShowUnlock(true)}>Unlock Identity</button>
        )
      ) : <Link className="mt-3 inline-block underline" to="/learner/secure-identity">Open Privacy &amp; Security</Link>}
    </div>
  );

  return (
    <section className={`vpf vpf-theme-blue${step === "choose" ? " vpf-choose" : step === "review" ? " vpf-choose vpf-review" : ""}`} aria-label="Get verified proof">
      {step === "choose" || step === "review" ? (
        <header className="vpf-choose-header">
          {step === "choose" ? (
            <Link className="vpf-back" to="/learner/dashboard"><ArrowLeft className="h-4 w-4" /> Back to Dashboard</Link>
          ) : (
            <button type="button" className="vpf-back" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Back to Wallet</button>
          )}
          <div className="vpf-hero">
            <div className="vpf-hero-icon"><ShieldCheck className="h-8 w-8" /></div>
            <div>
              <h1 className="vpf-hero-title">Get <span>Verified Proof</span></h1>
              <p className="vpf-hero-sub">
                {step === "choose" ? <>
                  Select the achievement you want to digitally sign with your identity.
                  <br />SIJIL adds the signed credential to your wallet.
                </> : "Review the information and supporting evidence before issuing this credential."}
              </p>
            </div>
          </div>
          <div className="vpf-choose-art" aria-hidden="true">
            <div className="vpf-art-back" />
            <div className="vpf-art-front"><span /><ShieldCheck /></div>
          </div>
        </header>
      ) : (
        <button type="button" className="vpf-back" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Back to Wallet</button>
      )}

      <Progress active={progress} />

      {error ? <p role="alert" className="vpf-error">{error}</p> : null}

      {step === "choose" ? (
        <div className="vpf-card vpf-choose-card">
          <section className="vpf-how" aria-label="How it works">
            <h2><Info aria-hidden="true" /> How it works?</h2>
            <div><Laptop aria-hidden="true" /><span><strong>Select an achievement</strong>Choose the skill you want to sign.</span></div>
            <div><Search aria-hidden="true" /><span><strong>Review evidence</strong>Check your linked evidence.</span></div>
            <div><Award aria-hidden="true" /><span><strong>Confirm issuance</strong>Digitally sign and add it to your wallet.</span></div>
          </section>

          {loading ? <p className="text-sm text-[#64748b]">Checking your validation trail…</p> : null}
          {!loading && items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[hsl(var(--sijil-blue)/0.1)] bg-[#f8fafc] p-6 text-sm text-[#475569]">
              <p>No declared achievements are available to review.</p>
              <Link className="mt-3 inline-flex font-semibold text-sijil-blue underline" to="/learner/validation">
                Open Competency Progress
              </Link>
            </div>
          ) : null}

          {!loading ? (
            <div className="space-y-1">
              <ProofGroup
                title={`Already Issued (${groups.issued.length})`}
                icon={<Layers className="h-4 w-4" />}
                items={groups.issued}
                selectedId={selectedId}
                onSelect={setSelectedId}
                badgeFor={(item) => (
                  <span className="vpf-badge vpf-badge-issued"><Check className="h-3.5 w-3.5" aria-hidden="true" /> Issued: {formatDate(item.issuedAt)}</span>
                )}
              />
              <ProofGroup
                title={`Ready to Issue (${groups.eligible.length})`}
                icon={<ShieldCheck className="h-4 w-4" />}
                items={groups.eligible}
                selectedId={selectedId}
                onSelect={setSelectedId}
                badgeFor={() => <span className="vpf-badge vpf-badge-ready">Ready</span>}
              />
              <ProofGroup
                title={`In Progress (${groups.pending.length})`}
                icon={<Clock3 className="h-4 w-4" />}
                items={groups.pending}
                selectedId={selectedId}
                onSelect={setSelectedId}
                badgeFor={() => <span className="vpf-badge vpf-badge-progress">In Progress</span>}
              />
            </div>
          ) : null}

          <div className="vpf-actions">
            <button type="button" className="vpf-btn vpf-btn-ghost" onClick={onBack}>Back</button>
            <button
              type="button"
              className="vpf-btn vpf-btn-primary"
              disabled={!selected}
              onClick={() => setStep("review")}
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {step === "review" && selected ? (
        <div className="space-y-4">
          <article className="vpf-card vpf-review-summary">
            <div className="vpf-hero">
              <div className="vpf-hero-icon"><Award className="h-7 w-7" /></div>
              <div>
                <p className="vpf-kicker">Review Credential Details</p>
                <h2 className="vpf-hero-title">{selected.skill}</h2>
                <p className="vpf-hero-sub">Review the information and supporting evidence before issuing this credential.</p>
              </div>
            </div>
            <div className="vpf-summary-grid">
              <SummaryCell icon={<Layers className="h-4 w-4" />} label="Credential Type" value="Competency" />
              <SummaryCell icon={<Clock3 className="h-4 w-4" />} label="Achievement" value={selected.skill} />
              <SummaryCell icon={<UserRound className="h-4 w-4" />} label="Credential For" value={displayName} />
              <SummaryCell icon={<Wallet className="h-4 w-4" />} label="Wallet" value="My Wallet" />
            </div>
          </article>

          <div className="vpf-review-grid">
          <article className="vpf-card vpf-review-evidence">
            <div className="vpf-evidence-head">
              <div>
                <h2 className="vpf-review-heading"><Layers aria-hidden="true" /> Review Evidence</h2>
                <p className="vpf-hero-sub">Explore the evidence and reviews used to verify this achievement.</p>
              </div>
              <button
                type="button"
                className="vpf-peer-btn"
                title="Peer reviews are optional"
                onClick={() => navigate("/learner/peer-reviews")}
              >
                <Users className="h-4 w-4" />
                Peer Reviews ({selected.reviewCount})
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="vpf-evidence-list">
              <EvidenceRow
                title="GitHub"
                icon={<Github />}
                description="Code, commits, and project work"
                count={selected.githubCount}
                onOpen={() => navigate("/learner/integrations")}
              />
              <EvidenceRow
                title="Moodle (LMS)"
                icon={<GraduationCap />}
                description="Course progress, submissions, and grades"
                count={selected.lmsCount}
                onOpen={() => navigate("/learner/integrations")}
              />
              <EvidenceRow
                title="Practical Task"
                icon={<ClipboardList />}
                description="Hands-on task to demonstrate the competency"
                count={selected.taskCount}
                onOpen={() => navigate("/learner/task")}
              />
            </div>

            {selected.status === "pending" ? (
              <div className="vpf-warn">
                <p className="font-semibold">This achievement is not ready to issue.</p>
                <p className="mt-1">Remaining step: {selected.nextStep}</p>
                <Link className="mt-3 inline-flex font-semibold text-sijil-blue underline" to={`/learner/validation/${selected.skillId}`}>
                  Open Competency Progress
                </Link>
              </div>
            ) : null}

            {selected.status === "issued" ? (
              <p className="mt-4 text-sm text-[#065f46]">A credential for this achievement is already on your account. A second one will not be requested.</p>
            ) : null}
          </article>
            <aside className="vpf-card vpf-review-check" aria-label="Issuance check">
              <h2 className="vpf-review-heading"><ShieldCheck aria-hidden="true" /> Issuance Check</h2>
              <p>{selected.status === "eligible" ? "Required checks are complete. SIJIL rechecks them before signing." : "SIJIL verifies the following before issuing a new credential."}</p>
              <ul className={selected.status === "eligible" ? "is-verified" : undefined}>
                {["Qualifying supporting evidence", "Completed assessment record", "Verified holder identity (DID)", "Trusted assessment commitment"].map((label) => (
                  <li key={label}>
                    {selected.status === "eligible" ? <Check aria-hidden="true" /> : <span aria-hidden="true" />}
                    {label}
                  </li>
                ))}
              </ul>
              <p className="vpf-review-optional">{REVIEW_NOTE}</p>
            </aside>
          </div>

          <div className="vpf-actions">
            <button type="button" className="vpf-btn vpf-btn-ghost" onClick={() => setStep("choose")}>Back</button>
            {selected.status === "eligible" && identityUnlocked ? (
              <button type="button" className="vpf-btn vpf-btn-primary" onClick={() => setStep("confirm")}>
                Confirm Issuance <ArrowRight className="h-4 w-4" />
              </button>
            ) : null}
            {selected.status === "issued" ? (
              <button type="button" className="vpf-btn vpf-btn-primary" onClick={() => onViewInWallet(selected.skillId)}>
                View in Wallet <ArrowRight className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          {selected.status === "eligible" && !identityUnlocked ? unlockPrompt : null}
        </div>
      ) : null}

      {step === "confirm" && selected?.status === "eligible" ? (
        <article className="vpf-card">
          <div className="vpf-hero">
            <div className="vpf-hero-icon" aria-hidden="true">{"</>"}</div>
            <div>
              <h1 className="vpf-hero-title">Confirm Credential Issuance</h1>
              <p className="vpf-hero-sub">Review the details below and issue the signed credential to your wallet.</p>
            </div>
          </div>

          <h2 className="vpf-section-title"><UserRound className="h-4 w-4" /> Recipient</h2>
          <div className="vpf-panel vpf-recipient">
            <div className="vpf-recipient-main">
              <span className="vpf-recipient-icon"><UserRound className="h-4 w-4" /></span>
              <div>
                <p className="vpf-item-title">You (Self)</p>
                <p className="vpf-item-sub">Learner Wallet</p>
              </div>
            </div>
            <div className="vpf-did">
              <span>Wallet ID</span>
              <span>{holderDid ? shortDid(holderDid) : "Not set"}</span>
              {holderDid ? (
                <button type="button" className="vpf-copy" onClick={() => void copyDid()} aria-label="Copy wallet ID">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          <h2 className="vpf-section-title"><FileText className="h-4 w-4" /> Credential Details</h2>
          <div className="vpf-panel vpf-cred-row">
            <div className="flex items-center gap-3 min-w-0">
              <span className="vpf-code-icon" aria-hidden="true">{"</>"}</span>
              <div className="min-w-0">
                <p className="vpf-item-title">{selected.skill}</p>
                <p className="vpf-item-sub">Course Completion</p>
              </div>
            </div>
            <div>
              <p className="vpf-meta-label">Issue Date</p>
              <p className="vpf-meta-value">{formatDate(new Date().toISOString())}</p>
            </div>
            <div>
              <p className="vpf-meta-label">Credential ID</p>
              <p className="vpf-meta-value">{previewCredentialId(selected.skill, selected.skillId, selected.credentialId)}</p>
            </div>
            <div>
              <p className="vpf-meta-label">Evidence Sources</p>
              <p className="vpf-meta-value">
                <span className="vpf-badge vpf-badge-ready mr-2">{sourceCount(selected.sources)}</span>
                {friendlySources(selected.sources)}
              </p>
            </div>
          </div>

          <div className="vpf-actions">
            <button type="button" className="vpf-btn vpf-btn-ghost" onClick={() => setStep("review")}>Back</button>
            <button
              type="button"
              className="vpf-btn vpf-btn-primary"
              disabled={issuing || !identityUnlocked}
              onClick={() => void confirmIssue()}
            >
              {issuing ? "Issuing…" : "Confirm Issuance →"}
            </button>
          </div>
          {!identityUnlocked ? unlockPrompt : null}
        </article>
      ) : null}

      {step === "success" && issued ? (
        <div className="vpf-success-stage">
          <article className="vpf-card vpf-success">
            <div className="vpf-success-icon" aria-hidden="true">
              <FileText className="size-11" />
              <span className="vpf-success-check"><Check className="size-4" /></span>
            </div>
            <h1 className="vpf-hero-title">Signed Credential Issued</h1>
            <p className="vpf-hero-sub vpf-success-copy">
              SIJIL added a signed record for your {issued.name} competency to your wallet.
            </p>
            <dl className="vpf-success-meta">
              <div><Layers aria-hidden="true" /><dt>Credential</dt><dd>{issued.name}</dd></div>
              <div><Landmark aria-hidden="true" /><dt>Issuer</dt><dd>{issued.issuer}</dd></div>
            </dl>
            <button type="button" className="vpf-btn vpf-btn-primary" onClick={() => onViewInWallet(issued.skillId)}>
              <Wallet className="size-4" aria-hidden="true" />
              View in Wallet
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </article>
        </div>
      ) : null}
    </section>
  );
}

export function VerifiedProofFlow({
  userId,
  credentials,
  learnerName,
  onBack,
  onViewInWallet,
  onIssued,
}: {
  userId: string;
  credentials: CredentialView[];
  learnerName?: string | null;
  onBack: () => void;
  onViewInWallet: (skillId: string) => void;
  onIssued: () => void;
}) {
  const { skills, loading: skillsLoading } = useDeclaredSkills();
  const { snapshot, signingIdentity, unlock } = useSsiIdentity();
  const holderDid = snapshot.local?.did ?? snapshot.server.did;
  const [items, setItems] = useState<ProofItem[]>([]);
  const [summariesLoading, setSummariesLoading] = useState(true);

  useEffect(() => {
    if (skillsLoading) return;
    let cancelled = false;
    setSummariesLoading(true);
    buildAllValidationSummaries(userId, skills, { includeAssessmentProgress: true })
      .then((summaries) => Promise.all(summaries.map(async (summary) => {
        const item = toProofItem(summary, credentials);
        if (item.status === "issued") return item;
        try {
          const readiness = await apiRequest<{ ready: boolean; reason: string | null }>(
            `/credentials/readiness/${encodeURIComponent(summary.skillId)}`,
          );
          return {
            ...item,
            status: readiness.ready ? "eligible" as const : "pending" as const,
            nextStep: readiness.reason ?? "Check the required evidence and try again.",
          };
        } catch (error) {
          const missingRoute = error instanceof ApiUnavailableError
            && error.status === 404 && error.message.startsWith("API 404: Route not found:");
          return {
            ...item,
            status: "pending" as const,
            nextStep: missingRoute
              ? "The running Wallet service does not support readiness checks yet. Try again after the service is updated."
              : "Wallet could not check issuance readiness. Reopen Get Verified Proof to try again.",
          };
        }
      })))
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .finally(() => {
        if (!cancelled) setSummariesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, skills, skillsLoading, credentials]);

  return (
    <VerifiedProofGuide
      items={items}
      loading={skillsLoading || summariesLoading}
      holderDid={holderDid}
      identityUnlocked={Boolean(signingIdentity && signingIdentity.did === snapshot.server.did)}
      onUnlock={snapshot.status === "locked" ? unlock : undefined}
      learnerName={learnerName}
      onBack={onBack}
      onViewInWallet={onViewInWallet}
      onIssue={async (skillId) => {
        const created = await issueCredentialForSkill(userId, skillId);
        onIssued();
        return created;
      }}
    />
  );
}

function Progress({ active }: { active: number }) {
  const labels = ["Choose Achievement", "Review Details", "Confirm Issuance"];
  return (
    <ol className="vpf-steps" aria-label="Proof progress">
      {labels.map((label, index) => {
        const current = index === active;
        const done = index < active;
        return (
          <li key={label} className="contents">
            {index > 0 ? <span className={`vpf-step-line ${done || current ? "is-done" : ""}`} aria-hidden="true" /> : null}
            <div
              aria-current={current ? "step" : undefined}
              className={`vpf-step ${current ? "is-active" : ""} ${done ? "is-done" : ""}`}
            >
              {current ? (
                <span className="vpf-step-pill">
                  <span className="vpf-step-num">{done ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                  {label}
                </span>
              ) : (
                <>
                  <span className="vpf-step-num">{done ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                  <span>{label}</span>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ProofGroup({
  title,
  icon,
  items,
  selectedId,
  onSelect,
  badgeFor,
}: {
  title: string;
  icon: ReactNode;
  items: ProofItem[];
  selectedId: string | null;
  onSelect: (skillId: string) => void;
  badgeFor: (item: ProofItem) => ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <div className="vpf-group">
      <h2 className="vpf-group-title">{icon}{title}</h2>
      <div className="vpf-list">
        {items.map((item) => {
          const selected = item.skillId === selectedId;
          return (
            <button
              key={item.skillId}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(item.skillId)}
              className={`vpf-item ${selected ? "is-selected" : ""}`}
            >
              <span className="vpf-check" aria-hidden="true"><Check className="h-3.5 w-3.5" /></span>
              <span className="vpf-code-icon" aria-hidden="true">{"</>"}</span>
              <span className="vpf-item-copy">
                <span className="vpf-item-title">{item.skill}</span>
                <span className="vpf-item-sub">{[item.stageLabel, item.evidence?.replace(/practical task passed/i, "Practical task completed")].filter(Boolean).join(" · ")}</span>
              </span>
              {badgeFor(item)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCell({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="vpf-summary-cell">
      <span className="vpf-meta-icon">{icon}</span>
      <div>
        <p className="vpf-meta-label">{label}</p>
        <p className="vpf-meta-value">{value}</p>
      </div>
    </div>
  );
}

function EvidenceRow({
  title,
  icon,
  description,
  count,
  onOpen,
}: {
  title: string;
  icon: ReactNode;
  description: string;
  count: number;
  onOpen: () => void;
}) {
  return (
    <div className="vpf-evidence-row">
      <span className="vpf-code-icon" aria-hidden="true">{icon}</span>
      <div className="vpf-item-copy">
        <p className="vpf-item-title">{title}</p>
        <p className="vpf-item-sub">{description}</p>
      </div>
      <span className="vpf-item-count">{count} item{count === 1 ? "" : "s"}</span>
      <button type="button" className="vpf-view-btn" onClick={onOpen}>
        View Details <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
