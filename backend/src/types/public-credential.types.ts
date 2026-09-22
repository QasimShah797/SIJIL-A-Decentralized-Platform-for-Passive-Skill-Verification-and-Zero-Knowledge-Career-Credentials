export type PublicShareStatus = "valid" | "revoked" | "expired" | "invalid";

export type TrustTier = "lms_preverified" | "corroborating";

export type TrustTierLabel = "LMS pre-verified" | "Corroborating";

export type EvidenceLedgerSource =
  | "lms"
  | "github"
  | "practical_task"
  | "peer_review"
  | "teacher_feedback";

export interface AtsResumeExperience {
  title: string;
  organization: string;
  detail: string;
  dates?: string;
}

export interface AtsResumeEducation {
  institution: string;
  program?: string;
  location?: string;
}

export interface AtsResumeSkill {
  competencyId: string;
  name: string;
  href: string;
  ledger?: EvidenceLedgerItem[];
}

export interface AtsResumeCertification {
  name: string;
  issuer?: string;
  issuedAt?: string;
}

export interface AtsResumeView {
  name: string;
  headline?: string;
  photoUrl?: string;
  contact: {
    email?: string;
    phone?: string;
    location?: string;
  };
  professionalSummary: string | null;
  workExperience: AtsResumeExperience[];
  education: AtsResumeEducation[];
  skills: AtsResumeSkill[];
  certifications: AtsResumeCertification[];
}

export interface EvidenceLedgerItem {
  id: string;
  source: EvidenceLedgerSource;
  title: string;
  detail: string;
  status: string | null;
  timestamp: string | null;
  url?: string | null;
  trustTier: TrustTier;
  trustTierLabel: TrustTierLabel;
}

export interface PublicCredentialWebView {
  disclosedPayload: Record<string, unknown>;
  proofType: string;
  verificationMethod: string | null;
  createdAt: string;
  expiresAt: string | null;
  payloadHash: string;
}

export interface WalletExportAvailability {
  apple: boolean;
  google: boolean;
}

export interface PublicCredentialResponse {
  status: PublicShareStatus;
  verified: boolean;
  verifiedAt: string | null;
  competencyId: string | null;
  selectedFields: string[];
  selectionMode: string;
  resume: AtsResumeView | null;
  webView: PublicCredentialWebView | null;
  walletExport: WalletExportAvailability;
}

export interface PublicCompetencyResponse {
  status: PublicShareStatus;
  verified: boolean;
  verifiedAt: string | null;
  competency: {
    competencyId: string;
    name: string;
    domain?: string;
    description?: string;
  } | null;
  ledger: EvidenceLedgerItem[] | null;
}
