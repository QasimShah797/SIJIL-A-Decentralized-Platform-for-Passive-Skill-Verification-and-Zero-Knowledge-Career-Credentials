import { useState } from "react";
import { Award, Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signedPresentationReview } from "@/lib/sharing/guide";

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

type Step = "select" | "review" | "approve" | "result";

export function GuidedShareFlow({
  credentials,
  historicalCount,
  canSign,
  identityLocked,
  identityNote,
  audience,
  onAudienceChange,
  onUnlock,
  unlockWorking,
  onApprove,
  onRevoke,
  onBack,
}: {
  credentials: GuidedShareCredential[];
  historicalCount: number;
  canSign: boolean;
  identityLocked: boolean;
  identityNote: string | null;
  audience: string;
  onAudienceChange: (value: string) => void;
  onUnlock: (passphrase: string) => Promise<void>;
  unlockWorking: boolean;
  onApprove: (input: { credentialIds: string[]; audience: string }) => Promise<GuidedShareResult>;
  onRevoke: (presentationId: string) => Promise<boolean>;
  onBack: () => void;
}) {
  const [step, setStep] = useState<Step>("select");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [passphrase, setPassphrase] = useState("");
  const [working, setWorking] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GuidedShareResult | null>(null);
  const [revoked, setRevoked] = useState(false);
  const selected = credentials.filter((credential) => selectedIds.has(credential.id));
  const progress = step === "result" ? 3 : step === "approve" ? 2 : step === "review" ? 1 : 0;

  const toggle = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setError(null);
  };

  const approve = async () => {
    if (selected.length === 0 || !canSign || working) return;
    setWorking(true);
    setError(null);
    try {
      const created = await onApprove({
        credentialIds: selected.map((credential) => credential.id),
        audience: audience.trim() || "sijil-recruiter-verify",
      });
      if (!created?.verifyUrl || !created.presentationId) {
        setError("SIJIL did not return a verification link. Nothing is shown as shared.");
        return;
      }
      setResult(created);
      setRevoked(false);
      setStep("result");
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Could not sign presentation.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <section id="share-achievements" className="mx-auto w-full max-w-3xl" aria-label="Share my achievements">
      <ol className="mb-5 grid grid-cols-3 gap-2" aria-label="Sharing progress">
        {["Select achievements", "Review sharing", "Approve"].map((label, index) => {
          const current = index === progress;
          const done = index < progress;
          return (
            <li key={label} aria-current={current ? "step" : undefined} className={`rounded-2xl px-2 py-3 text-center text-xs font-semibold ${current ? "bg-white text-[#312e81] shadow-sm" : "text-[#64748b]"}`}>
              <span className={`mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full ${current || done ? "bg-[#4f46e5] text-white" : "bg-[#e2e8f0] text-[#475569]"}`}>
                {done ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
      {error ? <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      {step === "select" ? (
        <div className="space-y-4 rounded-[28px] border border-[#e0e7ff] bg-white p-5 shadow-sm sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#4f46e5]">
              <Share2 className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-[#0f172a]">Share My Achievements</h1>
              <p className="mt-1 text-sm leading-relaxed text-[#475569]">
                Choose the signed achievements to include. This share sends each whole achievement. It does not hide fields inside an achievement, and it is not a zero-knowledge proof.
              </p>
            </div>
          </div>
          <p className="text-sm font-semibold text-[#312e81]">{selected.length} selected · {credentials.length} ready to sign{historicalCount > 0 ? ` · ${historicalCount} older record${historicalCount === 1 ? "" : "s"} stay on private links` : ""}</p>
          {credentials.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#dbeafe] bg-[#f8fafc] p-4 text-sm text-[#475569]">
              Unlock your identity and issue a signed achievement before you can approve a share from this device.
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
                        <span className="block text-xs font-medium text-[#023E8A]">Status: {credential.status}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
            <Button type="button" className="rounded-xl bg-[#4f46e5] hover:bg-[#4338ca]" disabled={selected.length === 0} onClick={() => setStep("review")}>
              Continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === "review" ? (
        <div className="space-y-4 rounded-[28px] border border-[#e0e7ff] bg-white p-5 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold text-[#0f172a]">Review what will be shared</h1>
          <p className="text-sm text-[#475569]">You control this approval. Nothing is signed until the next step.</p>
          <ul className="space-y-2">
            {selected.map((credential) => (
              <li key={credential.id} className="rounded-2xl border border-[#e2e8f0] px-4 py-3 text-sm">
                <p className="font-semibold text-[#0f172a]">{credential.title}</p>
                <p className="text-[#475569]">Issued by {credential.issuer} · Status: {credential.status}</p>
              </li>
            ))}
          </ul>
          <ul className="list-disc space-y-1 pl-5 text-sm text-[#334155]">
            {signedPresentationReview(selected.map((credential) => credential.title)).map((line) => <li key={line}>{line}</li>)}
          </ul>
          <label className="block text-sm font-medium text-[#0f172a]" htmlFor="share-audience">
            Who this share is for
            <Input id="share-audience" className="mt-1 bg-white" value={audience} aria-label="Who this share is for" onChange={(event) => onAudienceChange(event.target.value)} />
          </label>
          <p className="text-sm leading-relaxed text-[#475569]">
            This audience is sent with the signature. It does not make the link private to one person, and it does not hide information inside an achievement. Someone who receives the signed information can keep a copy.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep("select")}>Back</Button>
            <Button type="button" className="rounded-xl bg-[#4f46e5] hover:bg-[#4338ca]" onClick={() => setStep("approve")}>Continue</Button>
          </div>
        </div>
      ) : null}

      {step === "approve" ? (
        <div className="space-y-4 rounded-[28px] border border-[#e0e7ff] bg-white p-5 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold text-[#0f172a]">Approve this share</h1>
          <p className="text-sm text-[#475569]">{selected.length} achievement{selected.length === 1 ? "" : "s"} will be signed for {audience.trim() || "sijil-recruiter-verify"}.</p>
          {identityNote ? <p className="text-sm text-[#9a3412]">{identityNote}</p> : null}
          {identityLocked && !canSign ? (
            <form
              className="space-y-3 rounded-2xl border border-[#fed7aa] bg-[#fff7ed] p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void onUnlock(passphrase).then(() => setPassphrase("")).catch((unlockError: unknown) => {
                  setError(unlockError instanceof Error ? unlockError.message : "Could not unlock.");
                });
              }}
            >
              <p className="text-sm text-[#9a3412]">This device is locked. Enter the recovery password before you can approve. SIJIL cannot reset it.</p>
              <label className="block text-sm font-medium text-[#0f172a]" htmlFor="share-unlock-password">
                Recovery password
                <Input id="share-unlock-password" className="mt-1 bg-white" type="password" autoComplete="current-password" aria-label="Recovery password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} />
              </label>
              <Button type="submit" className="rounded-xl" disabled={unlockWorking || passphrase.length < 10}>
                {unlockWorking ? "Unlocking…" : "Unlock Identity"}
              </Button>
            </form>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep("review")}>Back</Button>
            <Button type="button" className="rounded-xl bg-[#4f46e5] hover:bg-[#4338ca]" disabled={!canSign || working || selected.length === 0} onClick={() => void approve()}>
              {working ? "Approving…" : "Approve share"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "result" && result ? (
        <div className={`space-y-4 rounded-[28px] border p-5 shadow-sm sm:p-8 ${revoked ? "border-[#fecaca] bg-[#fef2f2]" : "border-emerald-200 bg-white"}`}>
          <h1 className="text-2xl font-semibold text-[#0f172a]">{revoked ? "This share link has been stopped" : "Your verification link is ready"}</h1>
          <p className={`break-all font-mono text-xs ${revoked ? "text-[#64748b] line-through" : "text-[#14532d]"}`}>{result.verifyUrl}</p>
          <p className="text-sm leading-relaxed text-[#475569]">
            Stopping access means this verification link no longer shows the share. It does not erase a copy someone already saved, and it does not change your achievements or identity.
          </p>
          {!revoked ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="outline" className="rounded-xl">
                <a href={result.verifyUrl}>Open verification page</a>
              </Button>
              <Button type="button" variant="destructive" className="rounded-xl" disabled={revoking} onClick={() => {
                setRevoking(true);
                void onRevoke(result.presentationId)
                  .then((stopped) => {
                    if (stopped) setRevoked(true);
                  })
                  .catch((revokeError: unknown) => {
                    setError(revokeError instanceof Error ? revokeError.message : "Could not revoke presentation.");
                  })
                  .finally(() => setRevoking(false));
              }}>
                {revoking ? "Stopping…" : "Stop access"}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-[#7f1d1d]">Access stopped. This link no longer shows the shared achievement. Your records are unchanged.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
