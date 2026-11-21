import type { ReactNode } from "react";
import {
  Award,
  CalendarDays,
  Check,
  ClipboardList,
  Eye,
  Github,
  GraduationCap,
  Link2,
  Lock,
  Send,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
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
  { id: "github_evidence", label: "GitHub Evidence Summary", description: "Share a summary of your GitHub activity (e.g., repositories, commits).", icon: <Github className="h-4 w-4" /> },
  { id: "lms_evidence", label: "Moodle Learning Summary", description: "Share a summary of course learning (e.g., courses completed, progress).", icon: <GraduationCap className="h-4 w-4" /> },
  { id: "practical_task_result", label: "Practical Assessment Summary", description: "Share a summary of practical task result (e.g., score range or status).", icon: <ClipboardList className="h-4 w-4" /> },
  { id: "peer_reviews", label: "Peer Review Summary", description: "Share a summary of peer feedback (e.g., number of reviews, average rating).", icon: <Users className="h-4 w-4" /> },
  { id: "verification_status", label: "Digital Signature Status", description: "Include issuer’s digital signature verification status.", icon: <ShieldCheck className="h-4 w-4" /> },
  { id: "credential_metadata", label: "Blockchain Anchor Status", description: "Include blockchain anchoring (on-chain reference) status.", icon: <Link2 className="h-4 w-4" /> },
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
  "github_evidence",
  "practical_task_result",
  "peer_reviews",
  "verification_status",
  "credential_metadata",
];

export const DEFAULT_PUBLIC_FIELDS: DisclosureFieldId[] = [
  "learner_name",
  "competency_name",
  "timestamps",
  "verification_status",
  "credential_metadata",
  "github_evidence",
  "practical_task_result",
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

export function RecruiterShareDisclosure({
  skillName,
  learnerName,
  issuedAt,
  selectedFields,
  onChangeFields,
  onCancel,
  onConfirm,
  confirming,
}: {
  skillName: string;
  learnerName: string;
  issuedAt?: string | null;
  selectedFields: string[];
  onChangeFields: (next: string[]) => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean;
}) {
  const selected = new Set(selectedFields);
  return (
    <div className="sd-page">
      <nav className="sd-crumb" aria-label="Breadcrumb">
        <span>My Wallet</span><span>›</span>
        <span>{skillName} Credential</span><span>›</span>
        <strong>Share with Recruiter</strong>
      </nav>

      <header className="sd-header">
        <div className="sd-header-main">
          <div className="sd-header-icon"><ShieldCheck className="h-6 w-6" /></div>
          <div>
            <h1 className="sd-title">Share with Recruiter</h1>
            <p className="sd-sub">Select the information and evidence you want to share from your {skillName} digital credential.</p>
          </div>
        </div>
        <div className="sd-cred-chip">
          <span className="sd-cred-chip-icon" aria-hidden="true">{"</>"}</span>
          <div>
            <strong>{skillName} Credential</strong>
            <span>Issued by SIJIL</span>
          </div>
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
          <p className="sd-card-sub">Pick the attributes included in this share.</p>
          <div className="sd-options">
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
        </section>

        <aside>
          <div className="sd-privacy">
            <Lock className="h-4 w-4 shrink-0 mt-0.5" />
            <p>Only the information you select will be shared with this recruiter. Your unselected details (e.g., full scores, complete repositories, individual reviews) will remain private and will not be visible.</p>
          </div>
          <div className="sd-card">
            <h2 className="sd-preview-title"><Eye className="h-4 w-4" /> Share Preview</h2>
            <p className="sd-card-sub">How it will look to the recruiter.</p>
            <div className="sd-preview-card">
              <div className="sd-preview-head">
                <span className="sd-cred-chip-icon" aria-hidden="true">{"</>"}</span>
                <div>
                  <strong>{skillName}</strong>
                  <span>SIJIL Digital Credential</span>
                </div>
                <span className="sd-verified"><Check className="h-3 w-3" /> Verified</span>
              </div>
              <dl className="sd-preview-rows">
                {selected.has("learner_name") ? <div className="sd-preview-row"><dt>Learner Name</dt><dd>{learnerName}</dd></div> : null}
                {selected.has("competency_name") ? <div className="sd-preview-row"><dt>Competency</dt><dd>{skillName}</dd></div> : null}
                {selected.has("timestamps") ? <div className="sd-preview-row"><dt>Issue Date</dt><dd>{formatDate(issuedAt)}</dd></div> : null}
                {selected.has("verification_status") ? <div className="sd-preview-row"><dt>Digital Signature</dt><dd>Verified</dd></div> : null}
                {selected.has("credential_metadata") ? <div className="sd-preview-row"><dt>Blockchain Anchor</dt><dd>On-chain</dd></div> : null}
                {selected.has("github_evidence") ? <div className="sd-preview-row"><dt>GitHub</dt><dd>Summary shared</dd></div> : null}
                {selected.has("lms_evidence") ? <div className="sd-preview-row"><dt>Moodle</dt><dd>Summary shared</dd></div> : null}
                {selected.has("practical_task_result") ? <div className="sd-preview-row"><dt>Practical Task</dt><dd>Summary shared</dd></div> : null}
                {selected.has("peer_reviews") ? <div className="sd-preview-row"><dt>Peer Reviews</dt><dd>Summary shared</dd></div> : null}
              </dl>
            </div>
          </div>
        </aside>
      </div>

      <div className="sd-actions">
        <button type="button" className="sd-btn sd-btn-ghost" onClick={onCancel}>Cancel</button>
        <div className="sd-actions-right">
          <button type="button" className="sd-btn sd-btn-soft"><Eye className="h-4 w-4" /> Preview</button>
          <button
            type="button"
            className="sd-btn sd-btn-primary"
            disabled={confirming || selectedFields.length === 0}
            onClick={onConfirm}
          >
            <Send className="h-4 w-4" />
            {confirming ? "Sharing…" : "Confirm Share"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PublicLinkDisclosure({
  skillName,
  learnerName,
  issuedAt,
  selectedFields,
  onChangeFields,
  onCancel,
  onCreate,
  creating,
}: {
  skillName: string;
  learnerName: string;
  issuedAt?: string | null;
  selectedFields: string[];
  onChangeFields: (next: string[]) => void;
  expiresInDays?: number;
  onExpiresChange?: (days: 7 | 30 | 90) => void;
  accessCodeOn?: boolean;
  onAccessCodeChange?: (next: boolean) => void;
  onCancel: () => void;
  onCreate: () => void;
  creating?: boolean;
}) {
  const selected = new Set(selectedFields);
  return (
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
              <p className="sd-card-sub" style={{ marginBottom: 0 }}>Select the information to show on your public link.</p>
            </div>
          </div>
          <div className="sd-options sd-options-public">
            {PUBLIC_DISCLOSURE_FIELDS.map((field) => {
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
                  <span className="sd-option-copy">
                    <strong>{field.label}</strong>
                  </span>
                </button>
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

            {(selected.has("verification_status") || selected.has("credential_metadata")) ? (
              <div className="sd-verify-bar">
                {selected.has("verification_status") ? (
                  <span><Check className="h-3.5 w-3.5 text-[#16a34a]" /> Digitally Signed</span>
                ) : null}
                {selected.has("credential_metadata") ? (
                  <span><Check className="h-3.5 w-3.5 text-[#16a34a]" /> Blockchain Anchored</span>
                ) : null}
              </div>
            ) : null}

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

            {(selected.has("github_evidence") || selected.has("practical_task_result") || selected.has("lms_evidence") || selected.has("peer_reviews")) ? (
              <div className="sd-evidence-block">
                <p className="sd-evidence-title">Evidence Overview</p>
                {selected.has("github_evidence") ? (
                  <div className="sd-public-field">
                    <Github className="h-4 w-4" />
                    <div>
                      <p className="sd-public-label">GitHub Contributions</p>
                      <p className="sd-public-value">3 repositories</p>
                    </div>
                  </div>
                ) : null}
                {selected.has("practical_task_result") ? (
                  <div className="sd-public-field">
                    <ClipboardList className="h-4 w-4" />
                    <div>
                      <p className="sd-public-label">Practical Assessment</p>
                      <p className="sd-public-value">Score ≥ 50%</p>
                    </div>
                  </div>
                ) : null}
                {selected.has("lms_evidence") ? (
                  <div className="sd-public-field">
                    <GraduationCap className="h-4 w-4" />
                    <div>
                      <p className="sd-public-label">Moodle Learning</p>
                      <p className="sd-public-value">Course overview</p>
                    </div>
                  </div>
                ) : null}
                {selected.has("peer_reviews") ? (
                  <div className="sd-public-field">
                    <Users className="h-4 w-4" />
                    <div>
                      <p className="sd-public-label">Peer Review</p>
                      <p className="sd-public-value">Summary shared</p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
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
  );
}
