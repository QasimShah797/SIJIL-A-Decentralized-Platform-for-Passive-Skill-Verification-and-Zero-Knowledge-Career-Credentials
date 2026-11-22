import type { ReactNode } from "react";
import {
  Award,
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
  onConfirm,
  confirming,
  step = "choose",
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
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean;
  step?: "choose" | "preview";
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
          <strong>Share with Recruiter</strong>
        </nav>

        <ol className="sd-steps" aria-label="Share steps">
          <li className={step === "choose" ? "is-active" : "is-done"}>Choose Information</li>
          <li className={step === "preview" ? "is-active" : ""}>Preview & Confirm</li>
          <li>Share</li>
        </ol>

        <header className="sd-header">
          <div className="sd-header-main">
            <div className="sd-header-icon"><ShieldCheck className="h-6 w-6" /></div>
            <div>
              <h1 className="sd-title">Share with Recruiter</h1>
              <p className="sd-sub">Choose what to share from your {skillName} credential.</p>
            </div>
          </div>
          <div className="sd-cred-chip">
            <span className="sd-cred-chip-icon" aria-hidden="true">{"</>"}</span>
            <div>
              <strong>{skillName} Credential</strong>
              <span>Issued by SIJIL</span>
            </div>
            {issuerSignatureStatus === "valid" ? (
              <span className="sd-verified"><Check className="h-3 w-3" /> Verified</span>
            ) : (
              <span className="sd-anchor-muted">Signature {issuerSignatureStatus === "unknown" ? "pending" : issuerSignatureStatus}</span>
            )}
          </div>
        </header>

        <div className="sd-recipient">
          <div className="sd-recipient-main">
            <span className="sd-recipient-icon"><Users className="h-5 w-5" /></span>
            <div>
              <strong>All SIJIL Recruiters</strong>
              <span>Verified Recruiter • Access via SIJIL</span>
            </div>
          </div>
          <span className="sd-recipient-badge"><Check className="h-3.5 w-3.5" /> Recruiter</span>
        </div>

        <div className="sd-grid">
          <section className="sd-card">
            <h2 className="sd-card-title">Choose What to Share</h2>
            <p className="sd-card-sub">Your private details stay hidden.</p>

            <div className="sd-options" style={{ marginBottom: 14 }}>
              {RECRUITER_DISCLOSURE_FIELDS.map((field) => {
                const on = selected.has(field.id);
                return (
                  <button
                    key={field.id}
                    type="button"
                    className={`sd-option ${on ? "is-on" : ""}`}
                    aria-pressed={on}
                    onClick={() => onChangeFields(toggleField(selectedFields, field.id))}
                  >
                    <span className="sd-option-icon">{field.icon}</span>
                    <span className="sd-option-copy">
                      <strong>{field.label}</strong>
                      <span>{field.description}</span>
                    </span>
                    <span className="sd-check" aria-hidden="true"><Check className="h-3.5 w-3.5" /></span>
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
                        <span>{card.description}</span>
                        {privateDisabled && avail.privateBlockedReason ? (
                          <span className="mt-1 block text-xs text-[#64748b]">{avail.privateBlockedReason}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="sd-radio-group" role="radiogroup" aria-label={card.title}>
                      {(
                        [
                          ["details", card.detailsLabel],
                          ["private", "Show result privately"],
                          ["omit", "Don't share"],
                        ] as const
                      ).map(([value, label]) => {
                        const disabled = value === "private" && privateDisabled;
                        return (
                          <label
                            key={value}
                            className={`sd-radio ${mode === value ? "is-on" : ""} ${disabled ? "is-disabled opacity-60" : ""}`}
                          >
                            <input
                              type="radio"
                              name={`evidence-${card.id}`}
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

          <aside>
            <div className="sd-privacy">
              <Lock className="h-4 w-4 shrink-0 mt-0.5" />
              <p>When you choose “Show result privately”, SIJIL confirms you meet the requirement without sharing exact numbers.</p>
            </div>
            <div className="sd-card">
              <h2 className="sd-preview-title"><Eye className="h-4 w-4" /> Sharing Preview</h2>
              <p className="sd-card-sub">This is what the recruiter will see.</p>
              <div className="sd-preview-card">
                <div className="sd-preview-head">
                  <span className="sd-cred-chip-icon" aria-hidden="true">{"</>"}</span>
                  <div>
                    <strong>{skillName} Credential</strong>
                    <span>SIJIL Digital Credential</span>
                  </div>
                  {issuerSignatureStatus === "valid" ? (
                    <span className="sd-verified"><Check className="h-3 w-3" /> Verified</span>
                  ) : null}
                </div>
                <dl className="sd-preview-rows">
                  {selected.has("learner_name") ? <div className="sd-preview-row"><dt>Learner Name</dt><dd>{learnerName}</dd></div> : null}
                  {selected.has("competency_name") ? <div className="sd-preview-row"><dt>Competency</dt><dd>{skillName}</dd></div> : null}
                  {selected.has("timestamps") ? <div className="sd-preview-row"><dt>Issue Date</dt><dd>{formatDate(issuedAt)}</dd></div> : null}
                  <div className="sd-preview-row"><dt>Blockchain</dt><dd>Not anchored</dd></div>
                </dl>
                <ul className="sd-private-list">
                  {visibleCards.map((card) => {
                    const mode = evidenceModes[card.id];
                    if (mode === "omit") return null;
                    if (mode === "details") {
                      return (
                        <li key={card.id}>
                          <Check className="h-3.5 w-3.5 text-[#16a34a]" />
                          <span>{card.title}: summary shared</span>
                        </li>
                      );
                    }
                    const result = resultByType.get(card.claimType);
                    const confirmed = result?.status === "confirmed";
                    return (
                      <li key={card.id}>
                        {confirmed ? <Check className="h-3.5 w-3.5 text-[#16a34a]" /> : <span className="sd-dot" />}
                        <span>
                          {card.title}: {privatePreviewLabel(result)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
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
              disabled={confirming || selectedFields.length === 0}
              onClick={onConfirm}
            >
              <Send className="h-4 w-4" />
              {confirming ? "Sharing…" : step === "preview" ? "Share with Recruiter" : "Continue to Preview →"}
            </button>
          </div>
        </div>
      </div>
    </TooltipProvider>
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
                        {privateDisabled && avail.privateBlockedReason ? (
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
                      ).map(([value, label]) => {
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
