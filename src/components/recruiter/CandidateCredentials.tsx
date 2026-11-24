import { useEffect, useState } from "react";
import { Award, Box, CalendarDays, CheckCircle2, ChevronDown, CodeXml, Copy, Landmark, Layers, Link2, ShieldCheck, Signature, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractDisclosedCredentialIdentity, mapSsiCredentialVerifyToUiState, mapVerifyApiError } from "@/lib/recruiter-ssi-verify";
import { verifyCredentialApi, type VerifyCredentialResult } from "@/services/api/recruiter.api";
import { displayRecruiterSkillName, type RecruiterSkillCard } from "./RecruiterSkillEvidence";

function dateLabel(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function Badge({ text, positive = false }: { text: string; positive?: boolean }) {
  return (
    <span className={positive
      ? "inline-flex w-fit items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-900"
      : "inline-flex w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"}>
      {positive && <CheckCircle2 className="size-3.5" aria-hidden="true" />}
      {text}
    </span>
  );
}

export function CandidateCredentials({ cards }: { cards: RecruiterSkillCard[] }) {
  const [activeId, setActiveId] = useState(cards[0]?.id);
  const card = cards.find((item) => item.id === activeId) ?? cards[0];
  if (!card) return <section className="candidate-panel p-5">No issued credentials have been shared.</section>;
  return <CredentialDetails key={card.id} card={card} cards={cards} onSelect={setActiveId} />;
}

function CredentialDetails({ card, cards, onSelect }: {
  card: RecruiterSkillCard;
  cards: RecruiterSkillCard[];
  onSelect: (id: string) => void;
}) {
  const [result, setResult] = useState<VerifyCredentialResult | null>(null);
  const [status, setStatus] = useState("Checking credential");
  const [copyStatus, setCopyStatus] = useState("");
  const { issuedAt, did } = extractDisclosedCredentialIdentity(card.payload, card.credentialId);
  const skill = displayRecruiterSkillName(card.name);
  const checks = result?.checks;
  const verified = mapSsiCredentialVerifyToUiState(result) === "verified" && checks?.signature === "valid" && checks.document === "valid";
  const signatureValid = checks?.signature === "valid";
  const documentValid = checks?.document === "valid";
  const anchored = checks?.anchor === "match";
  const anchorLabel = anchored ? "Anchored" : checks?.anchor === "pending" ? "Anchor pending"
    : checks?.anchor === "missing" ? "Not anchored" : checks?.anchor === "hash_mismatch" ? "Anchor mismatch" : "Anchor status unavailable";
  const didBound = Boolean(did && (verified || result?.status === "pending_anchor") && checks?.holder === "bound");
  const verificationLabel = verified ? "Credential Verified" : status;

  useEffect(() => {
    if (!card.credentialId) return;
    let current = true;
    verifyCredentialApi(card.credentialId).then((next) => {
      if (!current) return;
      setResult(next);
      setStatus(next.status === "revoked" ? "Credential revoked"
        : next.status === "tampered" ? "Verification failed"
        : next.checks?.signature === "valid" ? "Signature verified" : "Verification unavailable");
    }).catch((error: unknown) => {
      if (!current) return;
      const state = mapVerifyApiError(error instanceof Error ? error.message : "");
      setStatus(state === "expired" ? "Share expired" : state === "revoked" ? "Share revoked" : "Verification unavailable");
    });
    return () => { current = false; };
  }, [card.credentialId]);

  const copyDid = async () => {
    if (!did) return;
    try {
      await navigator.clipboard.writeText(did);
      setCopyStatus("DID copied");
    } catch {
      setCopyStatus("Could not copy DID");
    }
  };

  const didDisplay = did ? (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="break-all" title={did}>{did.length > 28 ? did.slice(0, 17) + "..." + did.slice(-7) : did}</span>
      <button type="button" aria-label="Copy DID" className="shrink-0 rounded p-1 hover:bg-blue-100" onClick={() => void copyDid()}>
        <Copy className="size-4" aria-hidden="true" />
      </button>
    </span>
  ) : "Not disclosed";

  const metadata = [
    { label: "Skill", text: skill, icon: Layers },
    { label: "Issuer", text: "SIJIL", icon: Landmark },
    { label: "Issued on", text: dateLabel(issuedAt) ?? "Not disclosed", icon: CalendarDays },
  ];
  const rows = [
    { label: "Decentralized ID (DID)", value: didDisplay, badge: didBound ? "Bound" : did ? "Shared" : "Private", positive: didBound, icon: Link2 },
    { label: "Digital Signature", value: signatureValid ? "Issuer signature verified" : checks?.signature === "invalid" ? "Invalid signature" : "Unavailable", badge: signatureValid ? "Valid" : "Unavailable", positive: signatureValid, icon: Signature },
    { label: "Credential Proof", value: documentValid && signatureValid ? "Signed document verified" : "Verification unavailable", badge: documentValid && signatureValid ? "Verified" : "Unavailable", positive: documentValid && signatureValid, icon: Award },
    { label: "Blockchain Anchor", value: anchorLabel, badge: anchored ? "Confirmed" : "Unconfirmed", positive: anchored, icon: Box },
  ];

  return (
    <div className="candidate-profile-grid">
      <section className="candidate-panel min-w-0 space-y-3 p-4">
        <div>
          <h2 className="candidate-panel-title"><ShieldCheck className="size-5" aria-hidden="true" /> Credentials ({cards.length})</h2>
          <p className="mt-1 text-sm text-slate-600">Digitally signed credentials shared by this learner.</p>
        </div>
        {cards.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {cards.map((item) => <Button key={item.id} size="sm" type="button" variant={item.id === card.id ? "default" : "outline"}
              aria-pressed={item.id === card.id} onClick={() => onSelect(item.id)}>{displayRecruiterSkillName(item.name)}</Button>)}
          </div>
        )}
        <details open className="group rounded-xl border border-blue-100 p-3">
          <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
            <span className="candidate-evidence-icon"><CodeXml className="size-6" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <h3 className="break-words font-bold text-sijil-blue">{skill} Credential</h3>
              <p className="text-xs text-slate-600">{["Issued by SIJIL", dateLabel(card.createdAt) && "Shared on " + dateLabel(card.createdAt)].filter(Boolean).join(" · ")}</p>
            </div>
            <Badge text={verified ? "Verified" : status} positive={verified} />
            <ChevronDown className="size-4 shrink-0 text-sijil-blue group-open:rotate-180" aria-hidden="true" />
          </summary>
          <dl className="my-3 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-3">
            {metadata.map(({ label, text, icon: Icon }) => (
              <div key={label} className="flex min-w-0 items-start gap-2">
                <Icon className="mt-1 size-5 shrink-0 text-sijil-blue" aria-hidden="true" />
                <div><dt className="text-xs text-slate-600">{label}</dt><dd className="break-words text-sm font-semibold">{text}</dd></div>
              </div>
            ))}
          </dl>
          <div className="overflow-hidden rounded-xl border border-blue-100">
            <h4 className="bg-blue-50 px-3 py-2 text-sm font-bold text-sijil-blue">Verification Details</h4>
            <dl className="divide-y divide-blue-50">
              {rows.map(({ label, value, badge, positive, icon: Icon }) => (
                <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <dt className="flex items-center gap-2 font-semibold"><Icon className="size-4 shrink-0 text-sijil-blue" aria-hidden="true" />{label}</dt>
                  <dd className="col-span-2 row-start-2 min-w-0 pl-6 sm:col-span-1 sm:row-start-auto sm:pl-0">{value}</dd>
                  <dd className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto"><Badge text={badge} positive={positive} /></dd>
                </div>
              ))}
            </dl>
          </div>
        </details>
        <span className="sr-only" role="status">{copyStatus}</span>
      </section>
      <aside className="min-w-0 space-y-3">
        <section className="candidate-panel p-4">
          <h2 className="candidate-panel-title"><UserRound className="size-5" aria-hidden="true" /> Candidate Identity</h2>
          <dl className="mt-2 divide-y divide-blue-50 text-xs">
            <div className="flex items-center justify-between gap-2 py-2"><dt>Decentralized ID (DID)</dt><dd>{didDisplay}</dd></div>
            <div className="flex items-center justify-between gap-2 py-2"><dt>Identity Status</dt><dd><Badge text={didBound ? "Bound" : did ? "Shared" : "Not disclosed"} positive={didBound} /></dd></div>
            <div className="flex items-center justify-between gap-2 py-2"><dt>SIJIL Account</dt><dd><Badge text="Learner" /></dd></div>
          </dl>
        </section>
        <section className="candidate-panel p-4">
          <h2 className="candidate-panel-title"><ShieldCheck className="size-5" aria-hidden="true" /> Credential Verification</h2>
          <div className={"candidate-status " + (verified ? "candidate-status-verified" : "")} role="status">
            {verified ? <CheckCircle2 className="size-6 shrink-0" aria-hidden="true" /> : <ShieldCheck className="size-6 shrink-0" aria-hidden="true" />}
            <div><strong>{verificationLabel}</strong><p className="text-xs">{verified ? "SIJIL verified the credential signature and current credential status." : signatureValid ? "The issuer signature checks out. See the anchor status separately." : "Verification uses the active recruiter share."}</p></div>
          </div>
        </section>
        <section className="candidate-panel p-4">
          <h2 className="candidate-panel-title"><Box className="size-5" aria-hidden="true" /> Blockchain Anchor</h2>
          <div className={"candidate-status " + (anchored ? "candidate-status-verified" : "")}><Box className="size-6 shrink-0" aria-hidden="true" /><strong>{anchorLabel}</strong></div>
        </section>
      </aside>
    </div>
  );
}
