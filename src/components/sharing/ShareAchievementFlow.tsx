import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  SHARE_EXPIRY_DAYS,
  canConfirmShare,
  projectSelectedFields,
  signedPresentationReview,
  zkpShareAvailability,
  type ShareField,
  type ShareMethod,
} from "@/lib/sharing/guide";

export type ShareRecord = {
  token: string;
  label: string;
  access: "active" | "expired" | "revoked";
  kind: "link" | "presentation" | "direct";
  recipient?: string | null;
  sharedAt?: string | null;
};

export function ShareAchievementFlow({
  skill,
  fields,
  linkAvailable,
  zkp,
  shares,
  working,
  error,
  resultUrl,
  resultNote,
  onCreateLink,
  onCreateSigned,
  onCreateDirect,
  onCreateAll,
  onSearchRecruiters,
  onRevoke,
  historyUnavailable = false,
  onRetryHistory,
}: {
  skill: string;
  fields: ShareField[];
  linkAvailable: boolean;
  zkp: { verified: boolean; fabric: string | null };
  shares: ShareRecord[];
  working: boolean;
  error: string | null;
  resultUrl: string | null;
  resultNote?: string | null;
  historyUnavailable?: boolean;
  onRetryHistory?: () => void;
  onCreateLink: (input: { selectedFields: string[]; hiddenLabels: string[]; expiresInDays: number }) => void;
  onCreateSigned: () => void;
  onCreateDirect?: (input: { recipientUserId: string; selectedFields: string[]; expiresInDays: number }) => void;
  onCreateAll?: (input: { selectedFields: string[]; expiresInDays: number }) => void;
  onSearchRecruiters?: (query: string) => Promise<Array<{ id: string; name: string; organization: string; title: string }>>;
  onRevoke: (share: ShareRecord) => void;
}) {
  const [step, setStep] = useState<"method" | "choose" | "review" | "confirm" | "manage">("method");
  const [method, setMethod] = useState<ShareMethod | "direct-recruiter" | "all-recruiters">("private-link");
  const [recruiterQuery, setRecruiterQuery] = useState("");
  const [recruiters, setRecruiters] = useState<Array<{ id: string; name: string; organization: string; title: string }>>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedRecruiter, setSelectedRecruiter] = useState<{ id: string; name: string; organization: string; title: string } | null>(null);
  const [selected, setSelected] = useState<string[]>(fields.map((field) => field.id));
  const [expiresInDays, setExpiresInDays] = useState<(typeof SHARE_EXPIRY_DAYS)[number]>(30);
  const [confirmed, setConfirmed] = useState(false);
  const projection = projectSelectedFields(fields, selected);
  const proof = zkpShareAvailability(zkp);
  const ready = method === "all-recruiters"
    ? confirmed && projection.included.length > 0
    : method === "direct-recruiter"
    ? confirmed && Boolean(selectedRecruiter) && projection.included.length > 0
    : method === "signed-presentation"
    ? confirmed
    : canConfirmShare({ confirmed, disclosedCount: projection.included.length });

  return (
    <section className="mx-auto max-w-xl space-y-5 px-4 py-6" aria-busy={working}>
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#023E8A]">Share My Achievements</p>
        <h1 className="text-2xl font-semibold text-[#0f172a]">{skill}</h1>
        <p className="text-sm text-[#475569]">Choose what someone can open, and for how long. A copy they already saved is not deleted if you stop sharing later.</p>
      </header>
      <ol className="flex flex-wrap gap-2 text-xs font-medium text-[#64748b]" aria-label="Sharing progress">
        {["Choose Information", "Review Sharing", "Confirm & Share", "Manage Shared Access"].map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ol>
      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      {step === "method" && onCreateAll ? (
        <article className="learner-stat-card space-y-2 p-4">
          <h2 className="text-sm font-semibold text-[#023E8A]">Share with all SIJIL recruiters</h2>
          <p className="text-sm text-[#475569]">Registered recruiters can see the details you select, including recruiters who join later. Your exact assessment score stays private.</p>
          <Button type="button" onClick={() => { setMethod("all-recruiters"); setConfirmed(false); setStep("choose"); }}>Choose information</Button>
        </article>
      ) : null}

      {step === "method" && !onCreateAll ? (
        <div className="grid gap-3">
          {onCreateDirect ? (
            <article className="learner-stat-card space-y-2 p-4">
              <h2 className="text-sm font-semibold text-[#023E8A]">Share with a SIJIL recruiter</h2>
              <p className="text-sm text-[#475569]">Choose a registered recruiter. The achievement appears in that recruiter's dashboard. It is not sent to every recruiter, and you do not paste a link.</p>
              <p className="text-sm text-[#475569]">A credential is the signed achievement. Learning evidence is the coursework or project detail you tick. Your exact assessment score stays private unless you later approve a separate proof.</p>
              <Button type="button" onClick={() => { setMethod("direct-recruiter"); setConfirmed(false); setStep("choose"); }}>Choose a recruiter</Button>
            </article>
          ) : null}
          <article className="learner-stat-card space-y-2 p-4">
            <h2 className="text-sm font-semibold text-[#023E8A]">Public verification link</h2>
            <p className="text-sm text-[#475569]">Anyone with the link can open the details you select. This does not add them to a recruiter dashboard, and it is not a zero-knowledge proof.</p>
            {linkAvailable ? (
              <Button type="button" onClick={() => { setMethod("private-link"); setConfirmed(false); setStep("choose"); }}>Choose Information</Button>
            ) : (
              <p className="text-sm text-[#475569]">This achievement is not available for a field-limited link yet.</p>
            )}
          </article>
          <article className="learner-stat-card space-y-2 p-4">
            <h2 className="text-sm font-semibold text-[#023E8A]">Signed share</h2>
            <p className="text-sm text-[#475569]">You approve this share with the key on this device. The recipient receives the whole achievement, not a hidden-field version. This is separate from a zero-knowledge proof.</p>
            <Button type="button" variant="outline" onClick={() => { setMethod("signed-presentation"); setConfirmed(false); setStep("review"); }}>Review Sharing</Button>
          </article>
        </div>
      ) : null}
      <p className="text-sm text-[#475569]">{proof.message}</p>

      {step === "choose" && method === "direct-recruiter" ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[#023E8A]">Choose a recruiter</h2>
          <label className="block text-sm text-[#334155]" htmlFor="recruiter-search">
            Search by name or organization
            <input
              id="recruiter-search"
              className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1"
              value={recruiterQuery}
              onChange={(event) => setRecruiterQuery(event.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSearchError(null);
              void onSearchRecruiters?.(recruiterQuery).then((rows) => {
                setRecruiters(rows);
                setSelectedRecruiter(null);
                setConfirmed(false);
              }).catch(() => {
                setRecruiters([]);
                setSearchError("The recruiter directory could not be loaded. Try again.");
              });
            }}
          >
            Search recruiters
          </Button>
          {searchError ? <p role="alert" className="text-sm text-[#334155]">{searchError}</p> : null}
          {recruiters.length === 0 ? <p className="text-sm text-[#475569]">Search for a recruiter with a finished SIJIL profile. A typed name is not a recruiter account.</p> : (
            <ul className="space-y-2">
              {recruiters.map((recruiter) => (
                <li key={recruiter.id}>
                  <button
                    type="button"
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedRecruiter?.id === recruiter.id ? "border-[#023E8A] bg-[#eff6ff]" : "border-[#e2e8f0]"}`}
                    onClick={() => { setSelectedRecruiter(recruiter); setConfirmed(false); }}
                  >
                    <span className="block font-medium text-[#0f172a]">{recruiter.name}</span>
                    <span className="block text-[#475569]">{recruiter.title ? `${recruiter.title}, ` : ""}{recruiter.organization}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <h3 className="text-sm font-semibold text-[#023E8A]">Choose what this recruiter can see</h3>
          {fields.map((field) => (
            <label key={field.id} className="flex items-center gap-2 text-sm text-[#334155]" htmlFor={`direct-field-${field.id}`}>
              <Checkbox
                id={`direct-field-${field.id}`}
                checked={selected.includes(field.id)}
                onCheckedChange={(value) => {
                  setSelected((current) => value === true
                    ? [...current, field.id]
                    : current.filter((id) => id !== field.id));
                  setConfirmed(false);
                }}
              />
              {field.label}
            </label>
          ))}
          <Button type="button" disabled={!selectedRecruiter || projection.included.length === 0} onClick={() => setStep("review")}>Review what they will see</Button>
        </div>
      ) : null}

      {step === "choose" && method !== "direct-recruiter" ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[#023E8A]">Choose Information</h2>
          {fields.map((field) => (
            <label key={field.id} className="flex items-center gap-2 text-sm text-[#334155]" htmlFor={`share-field-${field.id}`}>
              <Checkbox
                id={`share-field-${field.id}`}
                checked={selected.includes(field.id)}
                onCheckedChange={(value) => {
                  setSelected((current) => value === true
                    ? [...current, field.id]
                    : current.filter((id) => id !== field.id));
                  setConfirmed(false);
                }}
              />
              {field.label}
            </label>
          ))}
          <label className="block text-sm text-[#334155]" htmlFor="share-expiry">
            Link expiration
            <select
              id="share-expiry"
              className="mt-1 block rounded-md border border-input bg-background px-2 py-1"
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(Number(event.target.value) as 7 | 30 | 90)}
            >
              {SHARE_EXPIRY_DAYS.map((days) => (
                <option key={days} value={days}>{days} days</option>
              ))}
            </select>
          </label>
          <Button type="button" onClick={() => setStep("review")} disabled={projection.included.length === 0}>Review Sharing</Button>
        </div>
      ) : null}

      {step === "review" ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[#023E8A]">Review Sharing</h2>
          {method === "all-recruiters" ? (
            <>
              <p className="text-sm text-[#334155]">Your selected achievements will be visible to all registered SIJIL recruiters, including recruiters who join later. Your private assessment scores stay hidden.</p>
              <p className="text-sm text-[#475569]">Included: {projection.included.map((field) => field.label).join(", ") || "the achievement name"}.</p>
            </>
          ) : method === "direct-recruiter" && selectedRecruiter ? (
            <>
              <p className="text-sm text-[#334155]">This will be shared with {selectedRecruiter.name} at {selectedRecruiter.organization}. Other recruiters will not see it.</p>
              <p className="text-sm text-[#475569]">Included: {projection.included.map((field) => field.label).join(", ") || "the achievement name"}.</p>
              <p className="text-sm text-[#475569]">The exact assessment score stays hidden. Stopping access later does not delete a copy they already saved.</p>
            </>
          ) : method === "private-link" ? (
            <>
              <p className="text-sm text-[#334155]">The recipient will receive these items when SIJIL has them:</p>
              <ul className="list-disc pl-5 text-sm text-[#334155]">
                {projection.included.map((field) => <li key={field.id}>{field.label}</li>)}
              </ul>
              {projection.hidden.length > 0 ? (
                <p className="text-sm text-[#475569]">Not included: {projection.hidden.join(", ")}.</p>
              ) : null}
              <p className="text-sm text-[#475569]">This link expires in {expiresInDays} days. Stopping it later does not erase a copy someone already saved, and it does not revoke the achievement.</p>
            </>
          ) : (
            <ul className="list-disc pl-5 text-sm text-[#334155]">
              {signedPresentationReview([skill]).map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
          <Button type="button" onClick={() => setStep("confirm")}>Confirm & Share</Button>
        </div>
      ) : null}

      {step === "confirm" ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) return;
            if (method === "all-recruiters") {
              onCreateAll?.({
                selectedFields: projection.included.map((field) => field.id),
                expiresInDays,
              });
            } else if (method === "direct-recruiter" && selectedRecruiter) {
              onCreateDirect?.({
                recipientUserId: selectedRecruiter.id,
                selectedFields: projection.included.map((field) => field.id),
                expiresInDays,
              });
            } else if (method === "private-link") {
              onCreateLink({
                selectedFields: projection.included.map((field) => field.id),
                hiddenLabels: projection.hidden,
                expiresInDays,
              });
            } else {
              onCreateSigned();
            }
          }}
        >
          {method !== "direct-recruiter" ? (
            <p className="text-sm text-[#475569]">A public link is not shown as verified. It only lets someone open the details you selected.</p>
          ) : null}
          <label className="flex items-start gap-2 text-sm text-[#334155]">
            <Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} />
            I agree to share this information.
          </label>
          <Button type="submit" disabled={!ready || working}>{working ? "Sharing…" : "Confirm & Share"}</Button>
        </form>
      ) : null}

      {resultNote ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{resultNote}</p>
      ) : resultUrl ? (
        <p className="break-all rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Your public verification link is ready. Anyone with this link can see only the details you selected: {resultUrl}
        </p>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#023E8A]">Manage Shared Access</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setStep("manage")}>Manage Shared Access</Button>
        </div>
        {step === "manage" ? (
          <>
            <p className="text-sm text-[#475569]">Stopping a link or a presentation does not revoke the achievement, and it does not delete a copy someone already saved.</p>
            {historyUnavailable ? (
              <div className="space-y-2">
                <p role="alert" className="text-sm text-[#334155]">Sharing history temporarily unavailable</p>
                <Button type="button" variant="outline" size="sm" onClick={onRetryHistory}>Retry</Button>
              </div>
            ) : shares.length === 0 ? <p className="text-sm text-[#475569]">No saved shares for this achievement yet.</p> : (
              <ul className="space-y-2">
                {shares.map((share) => (
                  <li key={`${share.kind}-${share.token}`} className="learner-stat-card flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-[#0f172a]">{share.label}</p>
                      <p className="text-xs text-[#64748b]">
                        {share.kind === "direct"
                          ? `Shared with ${share.recipient || "a recruiter"}`
                          : share.kind === "link"
                            ? "Public verification link"
                            : "Signed share"}
                        {" · "}
                        {share.access === "active" ? "Shared" : share.access === "expired" ? "Expired" : "Access stopped"}
                        {share.sharedAt ? ` · ${new Date(share.sharedAt).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    {share.access === "active" ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => onRevoke(share)}>Stop Sharing</Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}
