import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Ban,
  Briefcase,
  Check,
  Copy,
  Info,
  Link2,
  Mail,
  Plus,
  Send,
  Share2,
  UserRound,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SHARE_EXPIRY_DAYS } from "@/lib/sharing/guide";
import {
  defaultEvidenceModesForAvailability,
  OMIT_EVIDENCE_MODES,
  type EvidenceShareAvailability,
} from "@/lib/evidence-share-availability";
import {
  DEFAULT_EVIDENCE_MODES,
  DEFAULT_PUBLIC_FIELDS,
  DEFAULT_RECRUITER_FIELDS,
  PublicLinkDisclosure,
  RecruiterShareDisclosure,
  type EvidenceModes,
  type EvidenceShareAvailability as UiEvidenceAvailability,
} from "./ShareDisclosureScreens";
import "./share-achievement-choice.css";

export type GuidedShareCredential = {
  id: string;
  title: string;
  issuer: string;
  status: string;
  issuedAt?: string | null;
  sharedWithRecruiters?: boolean;
  sharedPublicly?: boolean;
  evidenceAvailability?: EvidenceShareAvailability;
};

export type GuidedShareResult = {
  verifyUrl: string;
  presentationId: string;
};

export type DirectShareRecruiter = {
  id: string;
  name: string;
  organization: string;
  title: string;
};

export type ManagedShare = {
  id: string;
  label: string;
  kind: "all-recruiters" | "direct" | "public";
  detail: string;
  status: "active" | "expired" | "revoked";
  sharedAt: string | null;
};

type Method = "all-recruiters" | "public";
type Step = "method" | "choose" | "review" | "done";

export function GuidedShareFlow({
  credentials,
  learnerName = "Learner",
  onBack,
  onShareAll,
  onCreatePublicLink,
  onEmailPublicLink,
  managedShares = [],
  onRevokeManagedShare,
  onStopPublicLink,
}: {
  credentials: GuidedShareCredential[];
  learnerName?: string;
  onBack: () => void;
  onShareAll?: (input: {
    credentialIds: string[];
    selectedFields: string[];
    evidenceModes: EvidenceModes;
  }) => Promise<void>;
  onCreatePublicLink?: (input: {
    credentialId: string;
    selectedFields: string[];
    evidenceModes: EvidenceModes;
    expiresInDays: number;
  }) => Promise<{ shareUrl: string; shareId: string; token: string; skillName: string }>;
  onEmailPublicLink?: (input: {
    shareId: string;
    token: string;
    recipientEmail: string;
  }) => Promise<void>;
  managedShares?: ManagedShare[];
  onRevokeManagedShare?: (shareId: string) => Promise<boolean>;
  onStopPublicLink?: (shareId: string) => Promise<boolean>;
}) {
  const [method, setMethod] = useState<Method | null>(null);
  const [step, setStep] = useState<Step>("method");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedFields, setSelectedFields] = useState<string[]>([...DEFAULT_RECRUITER_FIELDS]);
  const [evidenceModes, setEvidenceModes] = useState<EvidenceModes>({ ...DEFAULT_EVIDENCE_MODES });
  const [expiresInDays, setExpiresInDays] = useState<(typeof SHARE_EXPIRY_DAYS)[number]>(7);
  const [accessCodeOn, setAccessCodeOn] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [publicShareId, setPublicShareId] = useState<string | null>(null);
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [publicSkillName, setPublicSkillName] = useState<string | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const selected = credentials.filter((credential) => selectedIds.has(credential.id));
  const primary = selected[0] ?? null;

  const activeAvailability = useMemo<UiEvidenceAvailability>(() => {
    const avail = primary?.evidenceAvailability;
    if (avail) return avail as UiEvidenceAvailability;
    return {
      practical_task_result: { present: false, privateAllowed: false, privateBlockedReason: null },
      github_evidence: { present: false, privateAllowed: false, privateBlockedReason: null },
      lms_evidence: { present: false, privateAllowed: false, privateBlockedReason: null },
      peer_reviews: { present: false, privateAllowed: false, privateBlockedReason: null },
    };
  }, [primary]);

  useEffect(() => {
    if (!primary) {
      setEvidenceModes({ ...OMIT_EVIDENCE_MODES });
      return;
    }
    setEvidenceModes(defaultEvidenceModesForAvailability(activeAvailability));
  }, [primary?.id, activeAvailability]);

  const resetSelection = () => {
    setSelectedIds(new Set());
    setSelectedFields([...DEFAULT_RECRUITER_FIELDS]);
    setEvidenceModes({ ...OMIT_EVIDENCE_MODES });
    setExpiresInDays(7);
    setAccessCodeOn(false);
    setError(null);
    setPublicUrl(null);
    setPublicShareId(null);
    setPublicToken(null);
    setPublicSkillName(null);
    setRecipientEmail("");
    setEmailStatus("idle");
    setEmailMessage(null);
    setCopied(false);
  };

  const startMethod = (next: Method) => {
    resetSelection();
    setSelectedFields(next === "public" ? [...DEFAULT_PUBLIC_FIELDS] : [...DEFAULT_RECRUITER_FIELDS]);
    setMethod(next);
    setStep("choose");
  };

  const toggle = (id: string) => {
    setSelectedIds((current) => {
      if (method === "public") {
        return new Set([id]);
      }
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setError(null);
  };

  const shareAll = async () => {
    if (selected.length === 0 || selectedFields.length === 0 || working) return;
    if (!onShareAll) {
      setError("Sharing is not available right now.");
      return;
    }
    setWorking(true);
    setError(null);
    try {
      await onShareAll({
        credentialIds: selected.map((credential) => credential.id),
        selectedFields,
        evidenceModes,
      });
      setStep("done");
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message.replace(/^API \d+:\s*/, "") : "The share could not be saved.");
    } finally {
      setWorking(false);
    }
  };

  const createPublicLink = async () => {
    if (selected.length !== 1 || selectedFields.length === 0 || working) return;
    if (!onCreatePublicLink) {
      setError("Public verification links are not available right now.");
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const created = await onCreatePublicLink({
        credentialId: selected[0].id,
        selectedFields,
        evidenceModes,
        expiresInDays,
      });
      setPublicUrl(created.shareUrl);
      setPublicShareId(created.shareId);
      setPublicToken(created.token);
      setPublicSkillName(created.skillName);
      setEmailStatus("idle");
      setEmailMessage(null);
      setStep("done");
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message.replace(/^API \d+:\s*/, "") : "The public link could not be created.");
    } finally {
      setWorking(false);
    }
  };

  const copyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
    } catch {
      setError("Could not copy the link. Select and copy it manually.");
    }
  };

  const sendEmail = async () => {
    if (!publicShareId || !publicToken || emailStatus === "sending") return;
    const email = recipientEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailStatus("failed");
      setEmailMessage("Enter a valid recipient email address.");
      return;
    }
    if (!onEmailPublicLink) {
      setEmailStatus("failed");
      setEmailMessage("Unable to send email. You can still copy the link.");
      return;
    }
    setEmailStatus("sending");
    setEmailMessage(null);
    try {
      await onEmailPublicLink({
        shareId: publicShareId,
        token: publicToken,
        recipientEmail: email,
      });
      setEmailStatus("sent");
      setEmailMessage("Email sent successfully");
    } catch (sendError) {
      setEmailStatus("failed");
      setEmailMessage(
        sendError instanceof Error && sendError.message
          ? sendError.message.replace(/^API \d+:\s*/, "")
          : "Unable to send email. You can still copy the link.",
      );
    }
  };

  return (
    <section
      id="share-achievements"
      className={`mx-auto w-full space-y-4 ${step === "review" || (step === "done" && method === "all-recruiters") ? "max-w-6xl" : "max-w-3xl"}`}
      aria-label="Share my achievements"
    >
      {error ? <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      {step === "method" ? (
        <div className="sac-page">
          <button type="button" className="sac-back" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back to Wallet
          </button>

          <header className="sac-header">
            <div className="sac-header-icon" aria-hidden="true">
              <Share2 className="h-7 w-7" />
            </div>
            <div>
              <h1 className="sac-title">Share My Achievement</h1>
              <p className="sac-subtitle">Choose how you want to share your verified credentials.</p>
            </div>
          </header>

          <div className="sac-grid">
            <article className="sac-card sac-card-recruiter">
              <div className="sac-art sac-art-recruiter" aria-hidden="true">
                <UserRound className="h-10 w-10" />
                <Briefcase className="h-6 w-6 sac-art-badge" />
              </div>
              <h2 className="sac-card-title">Share with a Recruiter</h2>
              <p className="sac-card-copy">
                Send your verified credentials directly to a recruiter or organization (e.g., for a job or internship).
              </p>
              <button
                type="button"
                className="sac-btn sac-btn-blue"
                onClick={() => startMethod("all-recruiters")}
              >
                Share with Recruiter <ArrowRight className="h-4 w-4" />
              </button>
            </article>

            <article className="sac-card sac-card-public">
              <div className="sac-art sac-art-public" aria-hidden="true">
                <Link2 className="h-10 w-10" />
              </div>
              <h2 className="sac-card-title">Create a Public Verification Link</h2>
              <p className="sac-card-copy">
                Generate a link that anyone can open to verify your achievements (e.g., for your CV or portfolio).
              </p>
              <button
                type="button"
                className="sac-btn sac-btn-purple"
                onClick={() => startMethod("public")}
              >
                Create Verification Link <ArrowRight className="h-4 w-4" />
              </button>
            </article>
          </div>
        </div>
      ) : null}

      {step === "choose" && method ? (
        <div className="space-y-5 rounded-[28px] border border-[hsl(var(--sijil-blue)/0.08)] bg-white p-5 shadow-sm sm:p-8">
          <div>
            <h1 className="text-2xl font-semibold text-[#0f172a]">
              {method === "public" ? "Choose Credential" : "Choose Achievements"}
            </h1>
            <p className="mt-1 text-sm text-[#475569]">
              {method === "public"
                ? "Select one issued credential to continue to Create Public Link."
                : "Select the achievements you want to share with SIJIL recruiters."}
            </p>
          </div>
          {credentials.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[hsl(var(--sijil-blue)/0.1)] bg-[#f8fafc] p-4 text-sm text-[#475569]">
              No achievements are ready to share yet.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {credentials.map((credential) => {
                const checked = selectedIds.has(credential.id);
                return (
                  <li key={credential.id}>
                    <button
                      type="button"
                      aria-pressed={checked}
                      onClick={() => toggle(credential.id)}
                      className={`flex h-full w-full items-start gap-3 rounded-2xl border p-4 text-left ${checked ? "border-sijil-blue bg-[hsl(var(--sijil-blue)/0.04)] ring-2 ring-[hsl(var(--sijil-blue)/0.17)]" : "border-[#e2e8f0] bg-white"}`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--sijil-blue)/0.04)] text-sijil-blue">
                        <Award className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-[#0f172a]">{credential.title}</span>
                        <span className="block text-xs text-[#475569]">Issued by {credential.issuer || "SIJIL"}</span>
                        <span className="block text-xs text-[#64748b]">Status: {credential.status}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => { setMethod(null); setStep("method"); resetSelection(); }}>Back</Button>
            <Button
              type="button"
              className="rounded-xl bg-sijil-blue hover:bg-sijil-blue"
              disabled={method === "public" ? selected.length !== 1 : selected.length === 0}
              onClick={() => setStep("review")}
            >
              Continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === "review" && method === "all-recruiters" && primary ? (
        <RecruiterShareDisclosure
          skillName={primary.title}
          learnerName={learnerName}
          issuedAt={primary.issuedAt}
          selectedFields={selectedFields}
          onChangeFields={setSelectedFields}
          evidenceModes={evidenceModes}
          onChangeEvidenceModes={setEvidenceModes}
          evidenceAvailability={activeAvailability}
          onCancel={() => setStep("choose")}
          onConfirm={() => void shareAll()}
          confirming={working}
        />
      ) : null}

      {step === "review" && method === "public" && primary ? (
        <PublicLinkDisclosure
          skillName={primary.title}
          learnerName={learnerName}
          issuedAt={primary.issuedAt}
          selectedFields={selectedFields}
          onChangeFields={setSelectedFields}
          evidenceModes={evidenceModes}
          onChangeEvidenceModes={setEvidenceModes}
          evidenceAvailability={activeAvailability}
          expiresInDays={expiresInDays}
          onExpiresChange={setExpiresInDays}
          accessCodeOn={accessCodeOn}
          onAccessCodeChange={setAccessCodeOn}
          onCancel={() => setStep("choose")}
          onCreate={() => void createPublicLink()}
          creating={working}
        />
      ) : null}

      {step === "done" && method === "all-recruiters" ? (
        <div className="recruiter-share-success">
          <Link className="sac-back text-sm" to="/learner/dashboard">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Dashboard
          </Link>
          <header className="mb-6 flex items-center gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-sijil-blue text-white">
              <Share2 className="size-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950">Share with Recruiters</h1>
              <p className="mt-1 text-sm text-slate-700">Control who can view your achievements and profile.</p>
            </div>
          </header>
          <article className="recruiter-share-success-card">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Visible to SIJIL Recruiters</h2>
              <p className="mt-3 text-base text-slate-700">Your verified achievements are now visible to all SIJIL recruiters.</p>
              <p role="status" className="mt-7 inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-2 text-sm font-bold text-green-800">
                <Check className="size-5 rounded-full bg-green-600 p-0.5 text-white" aria-hidden="true" />
                Status: Visible
              </p>
              <div className="mt-8 flex flex-wrap gap-3 sm:gap-5">
                <Button type="button" className="h-11 gap-2 rounded-xl bg-sijil-blue px-5 font-semibold text-white hover:bg-sijil-blue/90" onClick={() => { setMethod(null); setStep("method"); resetSelection(); }}>
                  <Plus className="size-5" aria-hidden="true" /> Create Another Share
                </Button>
                <Button type="button" variant="outline" className="h-11 gap-2 rounded-xl border-blue-200 bg-white px-5 font-semibold text-sijil-blue hover:bg-blue-50 hover:text-sijil-blue" onClick={onBack}>
                  <Wallet className="size-5" aria-hidden="true" /> Back to Wallet
                </Button>
              </div>
            </div>
            <img className="recruiter-share-success-art" src="/recruiter-share-success.png" alt="" />
          </article>
        </div>
      ) : null}

      {step === "done" && method === "public" ? (
        <div className="pvc-page">
          <button type="button" className="sac-back" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back to Wallet
          </button>

          <article className="pvc-card">
            <div className="pvc-success" aria-hidden="true">
              <span className="pvc-success-ring" />
              <span className="pvc-success-badge"><Check className="h-7 w-7" /></span>
            </div>
            <h1 className="pvc-title">Public Verification Link Created</h1>
            <p className="pvc-subtitle">
              Anyone with this link can verify the selected credential details without signing in.
            </p>

            <div className="pvc-credential">
              <span className="pvc-code" aria-hidden="true">{"</>"}</span>
              <div className="min-w-0 flex-1">
                <p className="pvc-label">Credential</p>
                <p className="pvc-skill">{publicSkillName ?? selected[0]?.title ?? "Verified credential"}</p>
              </div>
              <span className="pvc-active"><span className="pvc-dot" /> Active</span>
            </div>

            {publicUrl ? (
              <>
                <div className="pvc-link-box">
                  <p className="pvc-section-title"><Link2 className="h-4 w-4" /> Verification Link</p>
                  <div className="pvc-link-row">
                    <input className="pvc-link-input" readOnly value={publicUrl} aria-label="Verification link" />
                    <button
                      type="button"
                      className="pvc-copy"
                      onClick={() => void copyLink()}
                      aria-label={copied ? "Copied" : "Copy Link"}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="pvc-email-box">
                  <div className="pvc-email-head">
                    <Mail className="h-4 w-4" />
                    <div>
                      <p className="pvc-section-title" style={{ margin: 0 }}>Send via Email</p>
                      <p className="pvc-email-note">Uses the same verification link. No new share is created.</p>
                    </div>
                  </div>
                  <div className="pvc-email-row">
                    <label className="pvc-email-field" htmlFor="public-share-email">
                      <UserRound className="h-4 w-4" />
                      <input
                        id="public-share-email"
                        type="email"
                        autoComplete="email"
                        placeholder="name@example.com"
                        value={recipientEmail}
                        onChange={(event) => {
                          setRecipientEmail(event.target.value);
                          if (emailStatus !== "idle") {
                            setEmailStatus("idle");
                            setEmailMessage(null);
                          }
                        }}
                        disabled={emailStatus === "sending"}
                      />
                    </label>
                    <button
                      type="button"
                      className="pvc-send"
                      disabled={emailStatus === "sending" || !recipientEmail.trim()}
                      onClick={() => void sendEmail()}
                    >
                      <Send className="h-4 w-4" />
                      {emailStatus === "sending" ? "Sending…" : "Send Email"}
                    </button>
                  </div>
                  {emailMessage ? (
                    <p
                      role="status"
                      className={`text-sm ${emailStatus === "sent" ? "text-emerald-700" : "text-red-700"}`}
                    >
                      {emailMessage}
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}

            <p className="pvc-info">
              <Info className="h-4 w-4" />
              You can stop this link below. Stopping it does not revoke the credential itself.
            </p>

            <div className="pvc-footer">
              <button
                type="button"
                className="pvc-footer-btn"
                onClick={() => { setMethod(null); setStep("method"); resetSelection(); }}
              >
                <Link2 className="h-4 w-4" />
                Create Another Share
              </button>
              <button type="button" className="pvc-footer-link" onClick={onBack}>
                Back to Wallet
              </button>
              <button
                type="button"
                className="pvc-footer-stop"
                disabled={!publicShareId || !onStopPublicLink || working}
                onClick={() => {
                  if (!publicShareId || !onStopPublicLink) return;
                  void (async () => {
                    setWorking(true);
                    setError(null);
                    try {
                      if (!await onStopPublicLink(publicShareId)) return;
                      setMethod(null);
                      setStep("method");
                      resetSelection();
                    } catch (stopError) {
                      setError(stopError instanceof Error ? stopError.message.replace(/^API \d+:\s*/, "") : "Could not stop the link.");
                    } finally {
                      setWorking(false);
                    }
                  })();
                }}
              >
                <Ban className="h-4 w-4" />
                Stop Link
              </button>
            </div>
          </article>
        </div>
      ) : null}

      <div className="space-y-2 rounded-[28px] border border-[#e2e8f0] bg-white p-5">
        <h2 className="text-sm font-semibold text-[#0f172a]">Manage shared access</h2>
        <p className="text-sm text-[#475569]">Stopping a share hides it from recruiters or public visitors the next time they open the page.</p>
        {managedShares.length === 0 ? <p className="text-sm text-[#475569]">Nothing is shared yet.</p> : (
          <ul className="space-y-2">
            {managedShares.map((share) => (
              <li key={share.id} className="flex flex-col gap-2 rounded-xl border border-[#e2e8f0] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-[#0f172a]">{share.label}</p>
                  <p className="text-xs text-[#64748b]">
                    {share.status === "revoked"
                      ? "Sharing stopped"
                      : share.status === "expired"
                        ? "Expired"
                        : share.kind === "direct"
                          ? "Shared with a specific recruiter"
                          : share.kind === "public"
                            ? "Public verification link active"
                            : "Visible to all SIJIL recruiters"}
                    {share.detail ? ` · ${share.detail}` : ""}
                    {share.sharedAt ? ` · ${new Date(share.sharedAt).toLocaleDateString()}` : ""}
                  </p>
                </div>
                {share.status === "active" ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => void onRevokeManagedShare?.(share.id).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not stop sharing."))}>Stop sharing</Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
