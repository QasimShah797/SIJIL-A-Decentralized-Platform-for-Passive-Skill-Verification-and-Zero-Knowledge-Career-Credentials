/**
 * Learner-facing share choices.
 * A private link includes only the wallet fields the learner selects.
 * The server builds that payload. A signed presentation includes each
 * selected achievement's credential id and hash. Neither one is a zero-knowledge proof.
 */
export type ShareMethod = "private-link" | "signed-presentation";

export type ShareField = { id: string; label: string };

export const SHARE_EXPIRY_DAYS = [7, 30, 90] as const;

export function projectSelectedFields(
  fields: readonly ShareField[],
  selected: readonly string[],
): { included: ShareField[]; hidden: string[] } {
  const chosen = new Set(selected);
  return {
    included: fields.filter((field) => chosen.has(field.id)),
    hidden: fields.filter((field) => !chosen.has(field.id)).map((field) => field.label),
  };
}

export function recipientSees(included: readonly ShareField[], fieldId: string): boolean {
  return included.some((field) => field.id === fieldId);
}

export function walletShareRequest(input: {
  competencyId: string;
  selectedFields: readonly string[];
  expiresInDays: number;
}): {
  competencyId: string;
  selectionMode: "custom";
  selectedFields: string[];
  shareScope: "selected";
  expiresInDays: number;
} {
  return {
    competencyId: input.competencyId,
    selectionMode: "custom",
    selectedFields: [...input.selectedFields],
    shareScope: "selected",
    expiresInDays: input.expiresInDays,
  };
}

export function canConfirmShare(input: {
  confirmed: boolean;
  disclosedCount: number;
}): boolean {
  return input.confirmed && input.disclosedCount > 0;
}

export function signedPresentationReview(names: string[]): string[] {
  return names.map((name) => `${name}: the whole signed achievement, including its credential identifier and hash. Individual fields inside it are not hidden.`);
}

export function zkpShareAvailability(input: { verified: boolean; fabric: string | null }): {
  available: boolean;
  message: string;
} {
  if (!input.verified) {
    return {
      available: false,
      message: "A privacy proof can be prepared after this achievement has a signed credential. The exact score stays hidden.",
    };
  }
  if (input.fabric !== "active") {
    return {
      available: true,
      message: "A privacy proof can be prepared. The blockchain anchor is not active, so that part is reported as not checked.",
    };
  }
  return {
    available: true,
    message: "A privacy proof can be checked for this achievement. The exact score stays hidden.",
  };
}

export type ShareAccess = "active" | "expired" | "revoked";

export function shareAccess(input: {
  revoked: boolean;
  expiresAt: string;
  now?: number;
}): ShareAccess {
  if (input.revoked) return "revoked";
  const expires = new Date(input.expiresAt).getTime();
  if (!Number.isNaN(expires) && expires <= (input.now ?? Date.now())) return "expired";
  return "active";
}

export type VerificationLine = { label: string; value: string };

export interface RecruiterCheckDetails {
  document?: string;
  signature?: string;
  holder?: string;
  evidence?: string;
  issuer?: string;
  anchor?: string;
  revocation?: string;
  zkp?: string;
}

export function recruiterVerificationLines(input: {
  access: ShareAccess;
  ledgerStatus: string | null;
  checks?: RecruiterCheckDetails | null;
}): VerificationLine[] {
  if (input.access === "revoked") {
    return [
      { label: "Shared access", value: "Stopped" },
      { label: "Credential", value: "Not shown. Stopping a link does not delete copies someone already saved." },
    ];
  }
  if (input.access === "active" && input.checks) {
    return [
      { label: "Document", value: labelCheck(input.checks.document) },
      { label: "Signature", value: labelCheck(input.checks.signature) },
      { label: "Holder", value: labelCheck(input.checks.holder) },
      { label: "Evidence", value: labelCheck(input.checks.evidence) },
      { label: "Issuer", value: labelCheck(input.checks.issuer) },
      { label: "Blockchain", value: labelCheck(input.checks.anchor) },
      { label: "Revocation", value: labelCheck(input.checks.revocation) },
      { label: "Privacy proof", value: labelCheck(input.checks.zkp) },
    ];
  }
  if (input.access === "expired") {
    return [
      { label: "Shared access", value: "Expired" },
      { label: "Credential", value: "Not shown." },
    ];
  }
  switch (input.ledgerStatus) {
    case "verified":
      return [
        { label: "Signature", value: "Valid" },
        { label: "Credential", value: "Current record is active" },
        { label: "Blockchain", value: "Record matches" },
      ];
    case "revoked":
      return [
        { label: "Signature", value: "The signed record was found" },
        { label: "Credential", value: "Revoked" },
        { label: "Blockchain", value: "Not treated as current" },
      ];
    case "pending_anchor":
      return [
        { label: "Signature", value: "Valid" },
        { label: "Credential", value: "Not revoked in the current record" },
        { label: "Blockchain", value: "Confirmation pending" },
      ];
    case "tampered":
      return [
        { label: "Signature", value: "Does not match" },
        { label: "Credential", value: "Not accepted" },
        { label: "Blockchain", value: "Not treated as current" },
      ];
    case null:
      return [
        { label: "Signature", value: "Not checked yet" },
        { label: "Credential", value: "Verification has not been run" },
        { label: "Blockchain", value: "Not checked" },
      ];
    default:
      return [
        { label: "Signature", value: "Could not be confirmed" },
        { label: "Credential", value: "Verification unavailable" },
        { label: "Blockchain", value: "Could not be checked" },
      ];
  }
}

export function labelCheck(value: string | undefined): string {
  switch (value) {
    case "valid":
    case "match":
    case "bound":
    case "trusted":
    case "active":
      return "Passed";
    case "invalid":
    case "mismatch":
    case "untrusted":
    case "hash_mismatch":
      return "Failed";
    case "revoked":
      return "Revoked";
    case "pending":
      return "Pending";
    case "missing":
      return "Missing";
    case "unavailable":
      return "Unavailable";
    case "legacy":
      return "Legacy evidence was not re-checked";
    case "not_applicable":
      return "Not applicable";
    default:
      return "Not checked";
  }
}

export function presentationSubmitBody(input: {
  challengeId: string;
  did: string;
  signature: string;
}): { challengeId: string; did: string; signature: string } {
  return {
    challengeId: input.challengeId,
    did: input.did,
    signature: input.signature,
  };
}
