import { ZKP_UI_ENABLED } from "@/lib/zkp-ui";
import { useId, type ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import {
  Award,
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardList,
  Eye,
  Github,
  GraduationCap,
  Info,
  Link2,
  Lock,
  Send,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import "./share-disclosure.css";

export type DisclosureFieldId =
  | "learner_name"
  | "competency_name"
  | "timestamps"
  | "github_evidence"
  | "lms_evidence"
  | "practical_task_result"
  | "peer_reviews"
  | "verification_status"
  | "credential_metadata";

export type EvidenceShareMode = "details" | "private" | "omit";

export type EvidenceModes = {
  practical_task_result: EvidenceShareMode;
  github_evidence: EvidenceShareMode;
  lms_evidence: EvidenceShareMode;
  peer_reviews: EvidenceShareMode;
};

export type PrivateResultPreview = {
  claimType: "practical_assessment" | "github_activity" | "moodle_learning" | "peer_review";
  status: "preparing" | "confirmed" | "failed" | "unmet" | "unavailable";
  label: string;
  detailHidden: string;
};

export type DisclosureField = {
  id: DisclosureFieldId;
  label: string;
  description: string;
  icon: ReactNode;
};

export const RECRUITER_DISCLOSURE_FIELDS: DisclosureField[] = [
  { id: "learner_name", label: "Learner Name", description: "Share your name with the recruiter.", icon: <UserRound className="h-4 w-4" /> },
  { id: "competency_name", label: "Competency Title", description: "Share the credential title (e.g., Java Programming).", icon: <Award className="h-4 w-4" /> },
  { id: "timestamps", label: "Issue Date", description: "Share when the credential was issued.", icon: <CalendarDays className="h-4 w-4" /> },
];

export const PUBLIC_DISCLOSURE_FIELDS: DisclosureField[] = [
  { id: "learner_name", label: "Learner Name", description: "", icon: <UserRound className="h-4 w-4" /> },
  { id: "competency_name", label: "Competency Title (e.g., Java Programming)", description: "", icon: <Award className="h-4 w-4" /> },
  { id: "timestamps", label: "Issue Date", description: "", icon: <CalendarDays className="h-4 w-4" /> },
  { id: "verification_status", label: "Digital Signature (Verified)", description: "", icon: <ShieldCheck className="h-4 w-4" /> },
  { id: "credential_metadata", label: "Blockchain Anchor (On-chain)", description: "", icon: <Link2 className="h-4 w-4" /> },
  { id: "github_evidence", label: "GitHub Evidence (Summary only)", description: "", icon: <Github className="h-4 w-4" /> },
  { id: "lms_evidence", label: "Moodle Learning (Summary only)", description: "", icon: <GraduationCap className="h-4 w-4" /> },
  { id: "practical_task_result", label: "Practical Assessment (Summary only)", description: "", icon: <ClipboardList className="h-4 w-4" /> },
  { id: "peer_reviews", label: "Peer Review (Summary only)", description: "", icon: <Users className="h-4 w-4" /> },
];

export const DEFAULT_RECRUITER_FIELDS: DisclosureFieldId[] = [
  "learner_name",
  "competency_name",
  "timestamps",
];

export const DEFAULT_PUBLIC_FIELDS: DisclosureFieldId[] = [
  "learner_name",
  "competency_name",
  "timestamps",
  "verification_status",
];

export const DEFAULT_EVIDENCE_MODES: EvidenceModes = {
  practical_task_result: "omit",
  github_evidence: "omit",
  lms_evidence: "omit",
  peer_reviews: "omit",
};

export type EvidenceFieldAvailability = {
  present: boolean;
  privateAllowed: boolean;
  privateBlockedReason: string | null;
};

export type EvidenceShareAvailability = Record<keyof EvidenceModes, EvidenceFieldAvailability>;

const ALL_PRESENT_AVAILABILITY: EvidenceShareAvailability = {
  practical_task_result: { present: true, privateAllowed: true, privateBlockedReason: null },
  github_evidence: { present: true, privateAllowed: true, privateBlockedReason: null },
  lms_evidence: { present: true, privateAllowed: true, privateBlockedReason: null },
  peer_reviews: { present: true, privateAllowed: true, privateBlockedReason: null },
};

function privatePreviewLabel(result: PrivateResultPreview | undefined): string {
  if (!result) return "Private check on share · exact values hidden";
  if (result.status === "preparing") return "Private check on share · exact values hidden";
  if (result.status === "confirmed") return `${result.label} · ${result.detailHidden}`;
  return result.label;
}

const EVIDENCE_CARDS: Array<{
  id: keyof EvidenceModes;
  title: string;
  description: string;
  tooltip: string;
  detailsLabel: string;
  icon: ReactNode;
  claimType: PrivateResultPreview["claimType"];
}> = [
  {
    id: "practical_task_result",
    title: "Practical Assessment",
    description: "Hands-on task result",
    tooltip: "Confirm your result without showing your score.",
    detailsLabel: "Share my score",
    icon: <ClipboardList className="h-5 w-5" />,
    claimType: "practical_assessment",
  },
  {
    id: "github_evidence",
    title: "GitHub Activity",
    description: "Coding and project activity",
    tooltip: "Confirm your activity without showing the count.",
    detailsLabel: "Share activity count",
    icon: <Github className="h-5 w-5" />,
    claimType: "github_activity",
  },
  {
    id: "lms_evidence",
    title: "Moodle Learning",
    description: "Course learning and completion",
    tooltip: "Confirm progress without showing details.",
    detailsLabel: "Share completion %",
    icon: <GraduationCap className="h-5 w-5" />,
    claimType: "moodle_learning",
  },
  {
    id: "peer_reviews",
    title: "Peer Review",
    description: "Feedback from peers on your work",
    tooltip: "Confirm reviews without sharing feedback.",
    detailsLabel: "Share reviews",
    icon: <Users className="h-5 w-5" />,
    claimType: "peer_review",
  },
];

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function toggleField(current: string[], id: string): string[] {
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
}

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="sd-info-btn" aria-label="More information">
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-xs leading-snug">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

export function RecruiterShareDisclosure({
  skillName, learnerName, issuer, issuedAt, selectedFields, onChangeFields, evidenceModes, onChangeEvidenceModes,
  evidenceAvailability, evidenceStatus, onRefreshEvidence, credentials, activeId, onChooseCredential,
  onCancel, onConfirm, confirming, canContinue, step,
}: {
  skillName: string;
  learnerName: string;
  issuer: string;
  issuedAt?: string | null;
  selectedFields: string[];
  onChangeFields: (next: string[]) => void;
  evidenceModes: EvidenceModes;
  onChangeEvidenceModes: (next: EvidenceModes) => void;
  evidenceAvailability?: EvidenceShareAvailability;
  evidenceStatus: "loading" | "ready" | "error";
  onRefreshEvidence?: () => void;
  credentials: { id: string; title: string }[];
  activeId: string;
  onChooseCredential: (id: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean;
  canContinue: boolean;
  step: "choose" | "preview";
}) {
  const selected = new Set(selectedFields);
  const editing = step === "choose";
  const cards = EVIDENCE_CARDS.filter((card) => evidenceStatus === "ready" && evidenceAvailability?.[card.id]?.present);
  const included = cards.filter((card) => evidenceModes[card.id] !== "omit");
  const titleFor = (card: (typeof EVIDENCE_CARDS)[number]) =>
    card.id === "lms_evidence" ? "Moodle Activity" : card.id === "peer_reviews" ? "Peer Review Feedback" : card.title;

  return (
    <div className="sd-page sd-recruiter">
      <nav className="sd-crumb" aria-label="Breadcrumb">
        <span>My Wallet</span><span aria-hidden="true">›</span>
        <span>{skillName} Credential</span><span aria-hidden="true">›</span>
        <strong>Share with Recruiters</strong>
      </nav>
      <ol className="sd-steps" aria-label="Share steps">
        <li className={editing ? "is-active" : "is-done"} aria-current={editing ? "step" : undefined}>Choose Information</li>
        <li className={editing ? "" : "is-active"} aria-current={editing ? undefined : "step"}>Preview &amp; Confirm</li>
        <li>Share</li>
      </ol>
      <header className="sd-header">
        <div className="sd-header-main">
          <div className="sd-header-icon"><Users className="size-6" aria-hidden="true" /></div>
          <div>
            <h1 className="sd-title">Share with Recruiters</h1>
            <p className="sd-sub">Choose what SIJIL recruiters can see.</p>
          </div>
        </div>
        <div className="sd-cred-chip">
          <span className="sd-cred-chip-icon" aria-hidden="true">{"</>"}</span>
          <div><strong>{skillName} Credential</strong><span>Issued by {issuer}</span></div>
          <span className="sd-anchor-muted">Signature checked on share</span>
        </div>
      </header>
      {credentials.length > 1 && (
        <label className="sd-credential-select">
          Credential
          <select className="rounded-lg border border-slate-200 bg-white px-3 py-2" value={activeId}
            onChange={(event) => onChooseCredential(event.target.value)}>
            {credentials.map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
          </select>
        </label>
      )}
      <div className="sd-grid">
        <section className="sd-card" aria-labelledby="sd-recruiter-options">
          <h2 id="sd-recruiter-options" className="sd-card-title">{editing ? "Select Information to Share" : "Confirm Sharing"}</h2>
          {editing ? (
            <div className="sd-options">
              {credentials.length > 1 && <p className="sd-card-sub">Identity and issue date settings apply to all selected credentials.</p>}
              {RECRUITER_DISCLOSURE_FIELDS.map((field) => (
                <DisclosureSwitch key={field.id} label={field.label} description={field.description}
                  icon={field.icon} checked={selected.has(field.id)}
                  onChange={() => onChangeFields(toggleField(selectedFields, field.id))} />
              ))}
              {cards.map((card) => (
                <div key={card.id}>
                  <DisclosureSwitch label={titleFor(card)} description={card.description}
                    icon={card.icon} checked={evidenceModes[card.id] !== "omit"}
                    onChange={(checked) => onChangeEvidenceModes({ ...evidenceModes, [card.id]: checked ? "details" : "omit" })} />
                  {ZKP_UI_ENABLED && evidenceModes[card.id] !== "omit" && evidenceAvailability?.[card.id]?.privateAllowed && (
                    <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={evidenceModes[card.id] === "private"}
                        onChange={(event) => onChangeEvidenceModes({ ...evidenceModes, [card.id]: event.target.checked ? "private" : "details" })} />
                      Share a private proof
                    </label>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="sd-card-sub">SIJIL recruiters will be able to see the information you selected for each credential.</p>
          )}
          {evidenceStatus === "loading" && <p className="sd-card-sub" role="status">Checking linked evidence…</p>}
          {evidenceStatus === "error" && (
            <div className="mt-2 flex items-center gap-3">
              <p role="alert" className="text-sm text-slate-600">Could not load linked evidence.</p>
              {onRefreshEvidence && <button type="button" className="text-sm font-semibold text-sijil-blue underline" onClick={onRefreshEvidence}>Retry</button>}
            </div>
          )}
          {editing && evidenceStatus === "ready" && cards.length === 0 && (
            <p className="sd-card-sub">No linked evidence is available for this credential.</p>
          )}
        </section>
        <aside className="sd-card sd-recruiter-preview">
          <h2 className="sd-preview-title"><Eye className="size-5" aria-hidden="true" /> Sharing Preview</h2>
          <p className="sd-card-sub">This is what the recruiter will see.</p>
          <div className="sd-preview-card" aria-live="polite">
            <div className="sd-preview-head">
              <span className="sd-cred-chip-icon" aria-hidden="true">{"</>"}</span>
              <div><strong>{selected.has("competency_name") ? skillName + " Credential" : "Digital Credential"}</strong><span>SIJIL Digital Credential</span></div>
            </div>
            <dl className="sd-preview-rows">
              {selected.has("learner_name") && <div className="sd-preview-row"><dt>Learner Name</dt><dd>{learnerName}</dd></div>}
              {selected.has("competency_name") && <div className="sd-preview-row"><dt>Competency</dt><dd>{skillName}</dd></div>}
              {selected.has("timestamps") && <div className="sd-preview-row"><dt>Issue Date</dt><dd>{formatDate(issuedAt)}</dd></div>}
              {included.map((card) => (
                <div key={card.id} className="sd-preview-row">
                  <dt>{titleFor(card)}</dt>
                  <dd><Check className="mr-1 inline size-4 rounded-full bg-emerald-100 p-0.5 text-emerald-800" aria-hidden="true" />
                    {evidenceModes[card.id] === "private" ? "Private proof" : "Summary included"}
                  </dd>
                </div>
              ))}
            </dl>
            {selected.size === 0 && included.length === 0 && <p className="sd-card-sub">No optional information selected.</p>}
          </div>
        </aside>
      </div>
      <div className="sd-actions">
        <button type="button" className="sd-btn sd-btn-ghost" disabled={confirming} onClick={onCancel}>{editing ? "Cancel" : "Back"}</button>
        <button type="button" className="sd-btn sd-btn-primary" disabled={confirming || !canContinue} onClick={onConfirm}>
          {confirming ? "Sharing…" : editing ? "Continue to Preview" : "Share with Recruiters"}
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function DisclosureSwitch({ label, description, icon, checked, onChange }: {
  label: string;
  description: string;
  icon: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="sd-option sd-recruiter-row">
      <span className="sd-option-icon" aria-hidden="true">{icon}</span>
      <span className="sd-option-copy"><strong>{label}</strong><span id={id + "-hint"}>{description}</span></span>
      <Switch id={id} aria-label={label} aria-describedby={id + "-hint"} checked={checked} onCheckedChange={onChange}
        className="ml-auto shrink-0 data-[state=checked]:bg-sijil-blue" />
    </label>
  );
}

export function PublicLinkDisclosure({
  skillName,
  learnerName,
  issuedAt,
  selectedFields,
  onChangeFields,
  evidenceModes,
  onChangeEvidenceModes,
  evidenceAvailability = ALL_PRESENT_AVAILABILITY,
  privateResults = [],
  issuerSignatureStatus = "unknown",
  onCancel,
  onCreate,
  creating,
}: {
  skillName: string;
  learnerName: string;
  issuedAt?: string | null;
  selectedFields: string[];
  onChangeFields: (next: string[]) => void;
  evidenceModes: EvidenceModes;
  onChangeEvidenceModes: (next: EvidenceModes) => void;
  evidenceAvailability?: EvidenceShareAvailability;
  privateResults?: PrivateResultPreview[];
  issuerSignatureStatus?: "valid" | "invalid" | "missing" | "unknown";
  expiresInDays?: number;
  onExpiresChange?: (days: 7 | 30 | 90) => void;
  accessCodeOn?: boolean;
  onAccessCodeChange?: (next: boolean) => void;
  onCancel: () => void;
  onCreate: () => void;
  creating?: boolean;
}) {
  const selected = new Set(selectedFields);
  const resultByType = new Map(privateResults.map((item) => [item.claimType, item]));
  const visibleCards = EVIDENCE_CARDS.filter((card) => evidenceAvailability[card.id]?.present);
  return (
    <TooltipProvider delayDuration={200}>
      <div className="sd-page">
        <nav className="sd-crumb" aria-label="Breadcrumb">
          <span>My Wallet</span><span>›</span>
          <span>{skillName} Credential</span><span>›</span>
          <strong>Create Public Link</strong>
        </nav>

        <div className="sd-grid sd-grid-public">
          <section className="sd-card sd-card-tall">
            <div className="sd-panel-head">
              <span className="sd-panel-icon"><Lock className="h-4 w-4" /></span>
              <div>
                <h2 className="sd-card-title">Choose What to Share</h2>
                <p className="sd-card-sub" style={{ marginBottom: 0 }}>Your private details stay hidden.</p>
              </div>
            </div>

            <div className="sd-options sd-options-public" style={{ marginBottom: 14 }}>
              {(["learner_name", "competency_name", "timestamps"] as DisclosureFieldId[]).map((id) => {
                const field = PUBLIC_DISCLOSURE_FIELDS.find((item) => item.id === id)!;
                const on = selected.has(field.id);
                return (
                  <button
                    key={field.id}
                    type="button"
                    className={`sd-option sd-option-public ${on ? "is-on" : ""}`}
                    aria-pressed={on}
                    onClick={() => onChangeFields(toggleField(selectedFields, field.id))}
                  >
                    <span className={`sd-box-check ${on ? "is-on" : ""}`} aria-hidden="true">
                      {on ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                    <span className="sd-option-icon">{field.icon}</span>
                    <span className="sd-option-copy"><strong>{field.label}</strong></span>
                  </button>
                );
              })}
            </div>

            <div className="sd-evidence-cards">
              {visibleCards.length === 0 ? (
                <p className="sd-card-sub">No linked evidence is available to share for this credential.</p>
              ) : null}
              {visibleCards.map((card) => {
                const mode = evidenceModes[card.id];
                const avail = evidenceAvailability[card.id];
                const privateDisabled = !avail.privateAllowed;
                return (
                  <article key={card.id} className="sd-evidence-card">
                    <div className="sd-evidence-head">
                      <span className="sd-option-icon">{card.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="sd-evidence-title-row">
                          <strong>{card.title}</strong>
                          <InfoTip text={card.tooltip} />
                        </div>
                        {ZKP_UI_ENABLED && privateDisabled && avail.privateBlockedReason ? (
                          <span className="mt-1 block text-xs text-[#64748b]">{avail.privateBlockedReason}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="sd-radio-group" role="radiogroup" aria-label={card.title}>
                      {(
                        [
                          ["details", "Share details"],
                          ["private", "Show result privately"],
                          ["omit", "Don't share"],
                        ] as const
                      ).filter(([value]) => ZKP_UI_ENABLED || value !== "private").map(([value, label]) => {
                        const disabled = value === "private" && privateDisabled;
                        return (
                          <label
                            key={value}
                            className={`sd-radio ${mode === value ? "is-on" : ""} ${disabled ? "is-disabled opacity-60" : ""}`}
                          >
                            <input
                              type="radio"
                              name={`public-evidence-${card.id}`}
                              checked={mode === value}
                              disabled={disabled}
                              onChange={() => {
                                if (disabled) return;
                                onChangeEvidenceModes({ ...evidenceModes, [card.id]: value });
                              }}
                            />
                            <span>
                              {label}
                              {value === "private" ? <Lock className="ml-1 inline h-3.5 w-3.5" /> : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="sd-card sd-card-tall">
            <div className="sd-panel-head">
              <span className="sd-panel-icon"><Eye className="h-4 w-4" /></span>
              <div>
                <h2 className="sd-card-title">Preview – Public Link</h2>
                <p className="sd-card-sub" style={{ marginBottom: 0 }}>This is how your credential will look to anyone with the link.</p>
              </div>
            </div>

            <div className="sd-public-preview">
              <div className="sd-preview-head">
                <span className="sd-cred-chip-icon" aria-hidden="true">{"</>"}</span>
                <div>
                  <strong>{skillName} Competency</strong>
                  <span>SIJIL Digital Credential</span>
                </div>
                <span className="sd-active">Active</span>
              </div>

              <div className="sd-verify-bar">
                {issuerSignatureStatus === "valid" ? (
                  <span><Check className="h-3.5 w-3.5 text-[#16a34a]" /> Digitally Signed</span>
                ) : (
                  <span>Signature {issuerSignatureStatus === "unknown" ? "pending check" : issuerSignatureStatus}</span>
                )}
                <span>Not anchored</span>
              </div>

              <div className="sd-public-fields">
                {selected.has("learner_name") ? (
                  <div className="sd-public-field">
                    <UserRound className="h-4 w-4" />
                    <div>
                      <p className="sd-public-label">Learner Name</p>
                      <p className="sd-public-value">{learnerName}</p>
                    </div>
                  </div>
                ) : null}
                {selected.has("timestamps") ? (
                  <div className="sd-public-field">
                    <CalendarDays className="h-4 w-4" />
                    <div>
                      <p className="sd-public-label">Issue Date</p>
                      <p className="sd-public-value">{formatDate(issuedAt)}</p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="sd-evidence-block">
                <p className="sd-evidence-title">Evidence Overview</p>
                {visibleCards.map((card) => {
                  const mode = evidenceModes[card.id];
                  if (mode === "omit") return null;
                  if (mode === "details") {
                    return (
                      <div key={card.id} className="sd-public-field">
                        {card.icon}
                        <div>
                          <p className="sd-public-label">{card.title}</p>
                          <p className="sd-public-value">Summary shared</p>
                        </div>
                      </div>
                    );
                  }
                  const result = resultByType.get(card.claimType);
                  return (
                    <div key={card.id} className="sd-public-field">
                      {card.icon}
                      <div>
                        <p className="sd-public-label">{card.title}</p>
                        <p className="sd-public-value">{privatePreviewLabel(result)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>

        <div className="sd-actions">
          <button type="button" className="sd-btn sd-btn-ghost" onClick={onCancel}>Cancel</button>
          <div className="sd-actions-right">
            <button
              type="button"
              className="sd-btn sd-btn-primary"
              disabled={creating || selectedFields.length === 0}
              onClick={onCreate}
            >
              <Link2 className="h-4 w-4" />
              {creating ? "Creating…" : "Create Public Link"}
            </button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
