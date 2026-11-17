import { useState } from "react";
import { Award, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  { id: "verification_status", label: "Verification summary" },
  { id: "learner_name", label: "Your name" },
  { id: "learner_institution", label: "Institution" },
  { id: "github_evidence", label: "Project evidence" },
  { id: "lms_evidence", label: "Course evidence" },
] as const;

type Step = "choose" | "review" | "done";

export function GuidedShareFlow({
  credentials,
  onBack,
  onShareAll,
  managedShares = [],
  onRevokeManagedShare,
}: {
  credentials: GuidedShareCredential[];
  onBack: () => void;
  onShareAll?: (input: { credentialIds: string[]; selectedFields: string[] }) => Promise<void>;
  managedShares?: ManagedShare[];
  onRevokeManagedShare?: (shareId: string) => Promise<void>;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedFields, setSelectedFields] = useState<string[]>(SHARE_FIELDS.map((field) => field.id));
  const [consent, setConsent] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = credentials.filter((credential) => selectedIds.has(credential.id));
  const included = SHARE_FIELDS.filter((field) => selectedFields.includes(field.id));

  const toggle = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConsent(false);
    setError(null);
  };

  const share = async () => {
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

  return (
    <section id="share-achievements" className="mx-auto w-full max-w-3xl space-y-4" aria-label="Share my achievements">
      {error ? <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      {step === "choose" ? (
        <div className="space-y-5 rounded-[28px] border border-[#e0e7ff] bg-white p-5 shadow-sm sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#4f46e5]">
              <Share2 className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-[#0f172a]">Share My Achievements</h1>
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
            <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
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

      {step === "review" ? (
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
            <Button type="button" className="rounded-xl bg-[#4f46e5] hover:bg-[#4338ca]" disabled={!consent || working} onClick={() => void share()}>
              {working ? "Sharing…" : "Share with All Recruiters"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "done" ? (
        <div className="space-y-4 rounded-[28px] border border-emerald-200 bg-white p-5 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold text-[#0f172a]">Visible to all SIJIL recruiters</h1>
          <p className="text-sm text-[#14532d]">Your achievements are now visible to all SIJIL recruiters.</p>
          <p className="text-sm text-[#475569]">Status: Visible to all SIJIL recruiters. This is not a public link. You can stop it below. A copy someone already saved is not deleted.</p>
          <Button type="button" variant="ghost" onClick={onBack}>Back to wallet</Button>
        </div>
      ) : null}

      <div className="space-y-2 rounded-[28px] border border-[#e2e8f0] bg-white p-5">
        <h2 className="text-sm font-semibold text-[#0f172a]">Manage shared access</h2>
        <p className="text-sm text-[#475569]">Stopping a share hides it from recruiters the next time they open SIJIL.</p>
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
