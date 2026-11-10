import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Award, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeclaredSkills } from "@/hooks/useLearnerData";
import { issueCredentialForSkill, type CredentialView } from "@/lib/db/credentials";
import { buildAllValidationSummaries, type ValidationSummary } from "@/lib/db/validation";

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
};

const PROVENANCE_NOTE =
  "A signed credential records that SIJIL accepted this evidence and the checks that apply to it. It does not independently verify the underlying project, course, or review content.";

export function proofStatusForSkill(
  summary: { skill: string; pipelineStage: string },
  credentials: { skill: string; name: string }[],
): ProofStatus {
  const issued = credentials.some((credential) => credential.skill === summary.skill || credential.name === summary.skill);
  if (issued) return "issued";
  if (summary.pipelineStage === "wallet_ready" || summary.pipelineStage === "in_wallet") return "eligible";
  return "pending";
}

export function toProofItem(summary: ValidationSummary, credentials: { skill: string; name: string }[]): ProofItem {
  return {
    skillId: summary.skillId,
    skill: summary.skill,
    status: proofStatusForSkill(summary, credentials),
    stageLabel: summary.currentStageLabel,
    evidence: summary.evidence,
    institution: summary.institution,
    nextStep: summary.nextStep,
    sources: summary.sources,
    result: summary.result,
    pipelineStage: summary.pipelineStage,
  };
}

type Step = "choose" | "review" | "confirm" | "success";

export function VerifiedProofGuide({
  items,
  loading,
  onBack,
  onViewInWallet,
  onIssue,
}: {
  items: ProofItem[];
  loading: boolean;
  onBack: () => void;
  onViewInWallet: () => void;
  onIssue: (skillId: string) => Promise<CredentialView | null>;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<CredentialView | null>(null);
  const selected = items.find((item) => item.skillId === selectedId) ?? null;
  const progress = step === "success" ? 3 : step === "confirm" ? 2 : step === "review" ? 1 : 0;

  const groups = useMemo(() => ({
    eligible: items.filter((item) => item.status === "eligible"),
    issued: items.filter((item) => item.status === "issued"),
    pending: items.filter((item) => item.status === "pending"),
  }), [items]);

  const confirmIssue = async () => {
    if (!selected || selected.status !== "eligible" || issuing) return;
    setIssuing(true);
    setError(null);
    try {
      const created = await onIssue(selected.skillId);
      if (!created?.id) {
        setError("SIJIL did not return a credential. Check your achievements before requesting it again.");
        return;
      }
      setIssued(created);
      setStep("success");
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : "Could not issue credential.");
    } finally {
      setIssuing(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-3xl" aria-label="Get verified proof">
      <Progress active={progress} />
      {error ? <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      {step === "choose" ? (
        <div className="space-y-4 rounded-[28px] border border-[#e0e7ff] bg-white p-5 shadow-sm sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#4f46e5]">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-[#0f172a]">Get Verified Proof</h1>
              <p className="mt-1 text-sm leading-relaxed text-[#475569]">
                Choose one achievement. SIJIL can issue a signed credential only when the existing validation trail already says it is ready.
              </p>
            </div>
          </div>
          {loading ? <p className="text-sm text-[#64748b]">Checking your validation trail…</p> : null}
          {!loading && items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#dbeafe] bg-[#f8fafc] p-6 text-sm text-[#475569]">
              <p>No declared achievements are available to review.</p>
              <Link className="mt-3 inline-flex font-semibold text-[#023E8A] underline" to="/learner/validation">Open Validation Trail</Link>
            </div>
          ) : null}
          {!loading ? (
            <div className="space-y-5">
              <ProofGroup title="Ready to issue" items={groups.eligible} selectedId={selectedId} onSelect={setSelectedId} />
              <ProofGroup title="Already issued" items={groups.issued} selectedId={selectedId} onSelect={setSelectedId} />
              <ProofGroup title="Still in progress" items={groups.pending} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
            <Button type="button" className="rounded-xl bg-[#4f46e5] hover:bg-[#4338ca]" disabled={!selected} onClick={() => setStep("review")}>
              Continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === "review" && selected ? (
        <article className="space-y-4 rounded-[28px] border border-[#e0e7ff] bg-white p-5 shadow-sm sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff7ed] text-[#c2410c]">
              <Award className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#4f46e5]">Review verified details</p>
              <h1 className="text-2xl font-semibold text-[#0f172a]">{selected.skill}</h1>
            </div>
          </div>
          <dl className="grid gap-3 rounded-2xl bg-[#f8fafc] p-4 text-sm sm:grid-cols-2">
            <Detail label="Validation stage" value={selected.stageLabel} />
            <Detail label="Evidence accepted so far" value={selected.evidence} />
            <Detail label="Institution" value={selected.institution || "Not recorded"} />
            <Detail label="Result" value={selected.result || "Not recorded"} />
            <Detail label="Sources" value={selected.sources.length ? selected.sources.join(", ") : "No evidence yet"} />
          </dl>
          <p className="rounded-2xl border border-[#dbeafe] bg-[#eff6ff] p-4 text-sm leading-relaxed text-[#1e3a8a]">{PROVENANCE_NOTE}</p>
          {selected.status === "pending" ? (
            <div className="rounded-2xl border border-[#fed7aa] bg-[#fff7ed] p-4 text-sm text-[#9a3412]">
              <p className="font-semibold">This achievement is not ready to issue.</p>
              <p className="mt-1">Remaining step: {selected.nextStep}</p>
              <Link className="mt-3 inline-flex font-semibold text-[#023E8A] underline" to={`/learner/validation/${selected.skillId}`}>
                Open Validation Trail
              </Link>
            </div>
          ) : null}
          {selected.status === "issued" ? (
            <p className="text-sm text-[#065f46]">A credential for this achievement is already on your account. A second one will not be requested.</p>
          ) : null}
          {selected.status === "eligible" && selected.pipelineStage === "in_wallet" ? (
            <p className="text-sm text-[#475569]">The validation trail marks this as in the wallet, and no issued credential matched this name. Issuance still uses the existing ready-to-issue rule.</p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep("choose")}>Back</Button>
            {selected.status === "eligible" ? (
              <Button type="button" className="rounded-xl bg-[#4f46e5] hover:bg-[#4338ca]" onClick={() => setStep("confirm")}>Continue</Button>
            ) : null}
            {selected.status === "issued" ? (
              <Button type="button" className="rounded-xl bg-[#4f46e5] hover:bg-[#4338ca]" onClick={onViewInWallet}>View in Wallet</Button>
            ) : null}
          </div>
        </article>
      ) : null}

      {step === "confirm" && selected?.status === "eligible" ? (
        <article className="space-y-4 rounded-[28px] border border-[#e0e7ff] bg-white p-5 text-center shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold text-[#0f172a]">Confirm issuance</h1>
          <p className="text-sm text-[#475569]">Request a signed credential for <span className="font-semibold text-[#0f172a]">{selected.skill}</span> using the evidence SIJIL has already accepted.</p>
          <p className="text-left text-sm leading-relaxed text-[#334155]">{PROVENANCE_NOTE}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep("review")}>Back</Button>
            <Button type="button" className="rounded-xl bg-[#4f46e5] hover:bg-[#4338ca]" disabled={issuing} onClick={() => void confirmIssue()}>
              {issuing ? "Issuing…" : "Issue verified proof"}
            </Button>
          </div>
        </article>
      ) : null}

      {step === "success" && issued ? (
        <article className="space-y-4 rounded-[28px] border border-emerald-200 bg-white p-5 text-center shadow-sm sm:p-8">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#ecfdf5] text-[#059669]">
            <Check className="h-10 w-10" />
          </div>
          <h1 className="text-2xl font-semibold text-[#064e3b]">Signed credential issued</h1>
          <p className="text-sm text-[#065f46]">SIJIL returned a credential for {issued.name || selected?.skill}.</p>
          <p className="text-sm text-[#475569]">Issuer: {issued.issuer || "Not included"} · Verification status: {issued.verification || "Not included"}</p>
          <p className="text-sm leading-relaxed text-[#334155]">{PROVENANCE_NOTE}</p>
          <Button type="button" className="h-11 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca]" onClick={onViewInWallet}>View in Wallet</Button>
        </article>
      ) : null}
    </section>
  );
}

export function VerifiedProofFlow({
  userId,
  credentials,
  onBack,
  onViewInWallet,
  onIssued,
}: {
  userId: string;
  credentials: CredentialView[];
  onBack: () => void;
  onViewInWallet: () => void;
  onIssued: () => void;
}) {
  const { skills, loading: skillsLoading } = useDeclaredSkills();
  const [summaries, setSummaries] = useState<ValidationSummary[]>([]);
  const [summariesLoading, setSummariesLoading] = useState(true);

  useEffect(() => {
    if (skillsLoading) return;
    let cancelled = false;
    setSummariesLoading(true);
    buildAllValidationSummaries(userId, skills)
      .then((rows) => {
        if (!cancelled) setSummaries(rows);
      })
      .finally(() => {
        if (!cancelled) setSummariesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, skills, skillsLoading]);

  const items = useMemo(
    () => summaries.map((summary) => toProofItem(summary, credentials)),
    [summaries, credentials],
  );

  return (
    <VerifiedProofGuide
      items={items}
      loading={skillsLoading || summariesLoading}
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
  const labels = ["Choose achievement", "Review details", "Confirm issuance"];
  return (
    <ol className="mb-5 grid grid-cols-3 gap-2" aria-label="Proof progress">
      {labels.map((label, index) => {
        const current = index === active;
        const done = index < active;
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
  );
}

function ProofGroup({
  title,
  items,
  selectedId,
  onSelect,
}: {
  title: string;
  items: ProofItem[];
  selectedId: string | null;
  onSelect: (skillId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-[#0f172a]">{title}</h2>
      {items.map((item) => {
        const selected = item.skillId === selectedId;
        return (
          <button
            key={item.skillId}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(item.skillId)}
            className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left ${selected ? "border-[#4f46e5] bg-[#eef2ff] ring-2 ring-[#c7d2fe]" : "border-[#e2e8f0] bg-white"}`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff7ed] text-[#c2410c]">
              <Award className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-[#0f172a]">{item.skill}</span>
              <span className="block truncate text-xs text-[#64748b]">{item.stageLabel} · {item.evidence}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">{label}</dt>
      <dd className="mt-1 text-[#0f172a]">{value}</dd>
    </div>
  );
}
