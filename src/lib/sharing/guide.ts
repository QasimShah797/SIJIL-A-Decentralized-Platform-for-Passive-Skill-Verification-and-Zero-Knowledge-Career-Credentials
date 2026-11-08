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
  if (input.verified && input.fabric === "active") {
    return {
      available: true,
      message: "A privacy proof can be checked for this achievement. The exact score stays hidden.",
    };
  }
  return {
    available: false,
    message: "A privacy proof is not shown as verified. The blockchain record this proof needs is not active.",
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

export function recruiterVerificationLines(input: {
  access: ShareAccess;
  ledgerStatus: string | null;
}): VerificationLine[] {
  if (input.access === "revoked") {
    return [
      { label: "Shared access", value: "Stopped" },
      { label: "Credential", value: "Not shown. Stopping a link does not delete copies someone already saved." },
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
