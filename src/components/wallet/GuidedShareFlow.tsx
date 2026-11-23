import { useState } from "react";
import { Award, Link2, Share2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SHARE_EXPIRY_DAYS } from "@/lib/sharing/guide";

export type GuidedShareCredential = {
  id: string;
  title: string;
  issuer: string;
  status: string;
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

const SHARE_FIELDS = [
  { id: "competency_name", label: "Achievement name" },
  { id: "competency_domain", label: "Subject area" },
  { id: "verification_status", label: "Skill confirmation summary" },
  { id: "learner_name", label: "Your name" },
  { id: "learner_institution", label: "Institution" },
  { id: "github_evidence", label: "Project evidence" },
  { id: "lms_evidence", label: "Course evidence" },
] as const;

type Method = "all-recruiters" | "public";
type Step = "method" | "choose" | "review" | "done";

export function GuidedShareFlow({
  credentials,
  onBack,
  onShareAll,
  onCreatePublicLink,
  onEmailPublicLink,
  managedShares = [],
  onRevokeManagedShare,
}: {
  credentials: GuidedShareCredential[];
  onBack: () => void;
  onShareAll?: (input: { credentialIds: string[]; selectedFields: string[] }) => Promise<void>;
  onCreatePublicLink?: (input: {
    credentialId: string;
    selectedFields: string[];
    expiresInDays: number;
  }) => Promise<{ shareUrl: string; shareId: string; token: string; skillName: string }>;
  onEmailPublicLink?: (input: {
    shareId: string;
    token: string;
    recipientEmail: string;
  }) => Promise<void>;
  managedShares?: ManagedShare[];
  onRevokeManagedShare?: (shareId: string) => Promise<void>;
}) {
  const [method, setMethod] = useState<Method | null>(null);
  const [step, setStep] = useState<Step>("method");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedFields, setSelectedFields] = useState<string[]>(SHARE_FIELDS.map((field) => field.id));
  const [expiresInDays, setExpiresInDays] = useState<(typeof SHARE_EXPIRY_DAYS)[number]>(30);
  const [consent, setConsent] = useState(false);
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
  const included = SHARE_FIELDS.filter((field) => selectedFields.includes(field.id));

  const resetSelection = () => {
    setSelectedIds(new Set());
    setSelectedFields(SHARE_FIELDS.map((field) => field.id));
    setExpiresInDays(30);
    setConsent(false);
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
    setConsent(false);
    setError(null);
  };

  const shareAll = async () => {
    if (!consent || selected.length === 0 || included.length === 0 || working) return;
    if (!onShareAll) {
      setError("Sharing is not available right now.");
      return;
    }
    setWorking(true);
    setError(null);
    try {
      await onShareAll({
        credentialIds: selected.map((credential) => credential.id),
        selectedFields: included.map((field) => field.id),
      });
      setStep("done");
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message.replace(/^API \d+:\s*/, "") : "The share could not be saved.");
    } finally {
      setWorking(false);
    }
  };

  const createPublicLink = async () => {
    if (!consent || selected.length !== 1 || included.length === 0 || working) return;
    if (!onCreatePublicLink) {
      setError("Public skill confirmation links are not available right now.");
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const created = await onCreatePublicLink({
        credentialId: selected[0].id,
        selectedFields: included.map((field) => field.id),
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
    <section id="share-achievements" className="mx-auto w-full max-w-3xl space-y-4" aria-label="Share my achievements">
      {error ? <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      {step === "method" ? (
        <div className="space-y-5 rounded-[28px] border border-[#e0e7ff] bg-white p-5 shadow-sm sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#4f46e5]">
              <Share2 className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-[#0f172a]">Share My Achievements</h1>
              <p className="mt-1 text-sm leading-relaxed text-[#475569]">
                Choose how to share issued credentials. Sharing with all SIJIL recruiters and creating a public skill confirmation link are separate options. You can use both.
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            <article className="rounded-2xl border border-[#e0e7ff] bg-[#f8fafc] p-4 space-y-2">
              <div className="flex items-center gap-2 text-[#312e81]">
                <Users className="h-4 w-4" />
                <h2 className="text-sm font-semibold">Share with All SIJIL Recruiters</h2>
              </div>
              <p className="text-sm text-[#475569]">
                Registered SIJIL recruiters will be able to see what you select, including recruiters who join later. People without an account will not.
              </p>
              <Button
                type="button"
                className="rounded-xl bg-[#4f46e5] hover:bg-[#4338ca]"
                onClick={() => startMethod("all-recruiters")}
              >
                Share with All SIJIL Recruiters
              </Button>
            </article>

            <article className="rounded-2xl border border-[#dbeafe] bg-white p-4 space-y-2">
              <div className="flex items-center gap-2 text-[#023E8A]">
                <Link2 className="h-4 w-4" />
                <h2 className="text-sm font-semibold">Create Public Skill Confirmation Link</h2>
              </div>
              <p className="text-sm text-[#475569]">
                Anyone with the link can open only the details you select. No SIJIL account is required. This does not add anyone to a recruiter dashboard.
              </p>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-[#bfdbfe]"
                onClick={() => startMethod("public")}
              >
                Create Public Skill Confirmation Link
              </Button>
            </article>
          </div>

          <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
        </div>
      ) : null}

      {step === "choose" && method === "all-recruiters" ? (
        <div className="space-y-5 rounded-[28px] border border-[#e0e7ff] bg-white p-5 shadow-sm sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#4f46e5]">
              <Share2 className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-[#0f172a]">Share with All SIJIL Recruiters</h1>
              <p className="mt-1 text-sm leading-relaxed text-[#475569]">
                Registered SIJIL recruiters will be able to see what you select, including recruiters who join later. People without an account will not.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-[#312e81]">Choose achievements</h2>
            {credentials.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[#dbeafe] bg-[#f8fafc] p-4 text-sm text-[#475569]">
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
                        className={`flex h-full w-full items-start gap-3 rounded-2xl border p-4 text-left ${checked ? "border-[#4f46e5] bg-[#eef2ff] ring-2 ring-[#c7d2fe]" : "border-[#e2e8f0] bg-white"}`}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff7ed] text-[#c2410c]">
                          <Award className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold text-[#0f172a]">{credential.title}</span>
                          <span className="block text-xs text-[#475569]">Issued by {credential.issuer}</span>
                          <span className="block text-xs text-[#64748b]">Status: {credential.status}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-[#312e81]">Choose what recruiters can see</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {SHARE_FIELDS.map((field) => (
                <li key={field.id}>
                  <label className="flex items-center gap-2 text-sm text-[#334155]" htmlFor={`share-field-${field.id}`}>
                    <input
                      id={`share-field-${field.id}`}
                      type="checkbox"
                      checked={selectedFields.includes(field.id)}
                      onChange={(event) => {
                        setSelectedFields((current) => event.target.checked
                          ? [...current, field.id]
                          : current.filter((id) => id !== field.id));
                        setConsent(false);
                      }}
                    />
                    {field.label}
                  </label>
                </li>
              ))}
            </ul>
            <p className="text-sm text-[#475569]">Project evidence and course evidence are examples of your work. Your exact assessment score stays private.</p>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => { setMethod(null); setStep("method"); resetSelection(); }}>Back</Button>
            <Button
              type="button"
              className="rounded-xl bg-[#4f46e5] hover:bg-[#4338ca]"
              disabled={selected.length === 0 || included.length === 0}
              onClick={() => setStep("review")}
            >
              Review sharing
            </Button>
          </div>
        </div>
      ) : null}

      {step === "choose" && method === "public" ? (
        <div className="space-y-5 rounded-[28px] border border-[#dbeafe] bg-white p-5 shadow-sm sm:p-8">
          <div>
            <h1 className="text-2xl font-semibold text-[#0f172a]">Create Public Skill Confirmation Link</h1>
            <p className="mt-1 text-sm text-[#475569]">
              Select one issued credential and the information that appears on the public page. Anyone with the link can open it without a SIJIL account.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-[#023E8A]">Choose credential</h2>
            {credentials.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[#dbeafe] bg-[#f8fafc] p-4 text-sm text-[#475569]">
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
                        className={`flex h-full w-full items-start gap-3 rounded-2xl border p-4 text-left ${checked ? "border-[#023E8A] bg-[#eff6ff] ring-2 ring-[#bfdbfe]" : "border-[#e2e8f0] bg-white"}`}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eff6ff] text-[#023E8A]">
                          <Award className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold text-[#0f172a]">{credential.title}</span>
                          <span className="block text-xs text-[#475569]">Issued by {credential.issuer}</span>
                          <span className="block text-xs text-[#64748b]">Status: {credential.status}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-[#023E8A]">Choose visible information</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {SHARE_FIELDS.map((field) => (
                <li key={field.id}>
                  <label className="flex items-center gap-2 text-sm text-[#334155]" htmlFor={`public-field-${field.id}`}>
                    <input
                      id={`public-field-${field.id}`}
                      type="checkbox"
                      checked={selectedFields.includes(field.id)}
                      onChange={(event) => {
                        setSelectedFields((current) => event.target.checked
                          ? [...current, field.id]
                          : current.filter((id) => id !== field.id));
                        setConsent(false);
                      }}
                    />
                    {field.label}
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <label className="block text-sm text-[#334155]" htmlFor="public-link-expiry">
            Link expiration
            <select
              id="public-link-expiry"
              className="mt-1 block rounded-md border border-input bg-background px-2 py-1"
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(Number(event.target.value) as 7 | 30 | 90)}
            >
              {SHARE_EXPIRY_DAYS.map((days) => (
                <option key={days} value={days}>{days} days</option>
              ))}
            </select>
          </label>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => { setMethod(null); setStep("method"); resetSelection(); }}>Back</Button>
            <Button
              type="button"
              className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]"
              disabled={selected.length !== 1 || included.length === 0}
              onClick={() => setStep("review")}
            >
              Review public link
            </Button>
          </div>
        </div>
      ) : null}

      {step === "review" && method === "all-recruiters" ? (
        <div className="space-y-4 rounded-[28px] border border-[#e0e7ff] bg-white p-5 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold text-[#0f172a]">Review sharing</h1>
          <p className="text-sm leading-relaxed text-[#334155]">
            Your selected achievements will be visible to all registered SIJIL recruiters, including recruiters who join later. Private assessment scores stay hidden.
          </p>
          <ul className="space-y-2">
            {selected.map((credential) => (
              <li key={credential.id} className="rounded-2xl border border-[#e2e8f0] px-4 py-3 text-sm">
                <p className="font-semibold text-[#0f172a]">{credential.title}</p>
                <p className="text-[#475569]">Issued by {credential.issuer}</p>
              </li>
            ))}
          </ul>
          <p className="text-sm text-[#475569]">Recruiters can see: {included.map((field) => field.label).join(", ")}.</p>
          <label className="flex items-start gap-2 text-sm text-[#334155]" htmlFor="all-recruiter-consent">
            <input id="all-recruiter-consent" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            I agree that every registered SIJIL recruiter may see this information.
          </label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep("choose")}>Back</Button>
            <Button type="button" className="rounded-xl bg-[#4f46e5] hover:bg-[#4338ca]" disabled={!consent || working} onClick={() => void shareAll()}>
              {working ? "Sharing…" : "Share with All Recruiters"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "review" && method === "public" ? (
        <div className="space-y-4 rounded-[28px] border border-[#dbeafe] bg-white p-5 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold text-[#0f172a]">Review public skill confirmation link</h1>
          <p className="text-sm text-[#334155]">
            Anyone with the link can open only the selected details for {selected[0]?.title ?? "this credential"}. This does not add them to a recruiter dashboard.
          </p>
          <p className="text-sm text-[#475569]">Visible: {included.map((field) => field.label).join(", ")}.</p>
          <p className="text-sm text-[#475569]">Expires in {expiresInDays} days. Stopping the link later does not delete a copy someone already saved.</p>
          <label className="flex items-start gap-2 text-sm text-[#334155]" htmlFor="public-link-consent">
            <input id="public-link-consent" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            I agree to share this information through a public skill confirmation link.
          </label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep("choose")}>Back</Button>
            <Button type="button" className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" disabled={!consent || working} onClick={() => void createPublicLink()}>
              {working ? "Creating link…" : "Generate public link"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "done" && method === "all-recruiters" ? (
        <div className="space-y-4 rounded-[28px] border border-emerald-200 bg-white p-5 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold text-[#0f172a]">Visible to all SIJIL recruiters</h1>
          <p className="text-sm text-[#14532d]">Your achievements are now visible to all SIJIL recruiters.</p>
          <p className="text-sm text-[#475569]">Status: Visible to all SIJIL recruiters. This is not a public link. You can stop it below. A copy someone already saved is not deleted.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => { setMethod(null); setStep("method"); resetSelection(); }}>
              Create another share
            </Button>
            <Button type="button" variant="ghost" onClick={onBack}>Back to wallet</Button>
          </div>
        </div>
      ) : null}

      {step === "done" && method === "public" ? (
        <div className="space-y-4 rounded-[28px] border border-emerald-200 bg-white p-5 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold text-[#0f172a]">Public Skill Confirmation Link Created</h1>
          <p className="text-sm text-[#14532d]">
            Anyone with this link can verify the selected credential details without signing in.
          </p>
          <p className="text-sm text-[#334155]">
            <span className="font-semibold">Credential:</span> {publicSkillName ?? selected[0]?.title ?? "Confirmed credential"}
          </p>
          {publicUrl ? (
            <div className="space-y-3">
              <p className="break-all rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{publicUrl}</p>
              <Button type="button" className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={() => void copyLink()}>
                {copied ? "Copied" : "Copy Link"}
              </Button>
              <div className="space-y-2 rounded-2xl border border-[#dbeafe] bg-[#f8fafc] p-4">
                <h2 className="text-sm font-semibold text-[#023E8A]">Send via Email</h2>
                <p className="text-sm text-[#475569]">Uses the same skill confirmation link. No new share is created.</p>
                <label className="block text-sm text-[#334155]" htmlFor="public-share-email">
                  Recipient email
                  <input
                    id="public-share-email"
                    type="email"
                    autoComplete="email"
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2"
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
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl border-[#bfdbfe]"
                  disabled={emailStatus === "sending" || !recipientEmail.trim()}
                  onClick={() => void sendEmail()}
                >
                  {emailStatus === "sending" ? "Sending…" : "Send Email"}
                </Button>
                {emailMessage ? (
                  <p
                    role="status"
                    className={`text-sm ${emailStatus === "sent" ? "text-emerald-700" : "text-red-700"}`}
                  >
                    {emailMessage}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          <p className="text-sm text-[#475569]">You can stop this link below. Stopping it does not revoke the credential itself.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => { setMethod(null); setStep("method"); resetSelection(); }}>
              Create another share
            </Button>
            <Button type="button" variant="ghost" onClick={onBack}>Back to wallet</Button>
          </div>
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
                            ? "Public skill confirmation link active"
                            : "Visible to all SIJIL recruiters"}
                    {share.detail ? ` · ${share.detail}` : ""}
                    {share.sharedAt ? ` · ${new Date(share.sharedAt).toLocaleDateString()}` : ""}
                  </p>
                </div>
                {share.status === "active" ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => void onRevokeManagedShare?.(share.id)}>Stop sharing</Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
