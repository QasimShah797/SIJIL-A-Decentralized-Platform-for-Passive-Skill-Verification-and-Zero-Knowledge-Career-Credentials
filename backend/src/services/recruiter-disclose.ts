/**
 * Restrict recruiter reads to fields the learner actually disclosed.
 */
import type { CredentialView } from "../types/credentials.types";

export interface DisclosedField {
  id: string;
  label?: string;
  value: string;
}

const CREDENTIAL_FIELD_BY_DISCLOSURE_ID: Record<string, keyof CredentialView> = {
  credentialName: "name",
  name: "name",
  skill: "skill",
  issuer: "issuer",
  validFrom: "validFrom",
  holderDid: "holderDid",
  issuerDid: "issuerDid",
  verification: "verification",
  attestation: "attestation",
};

export function credentialFromDisclosedFields(
  disclosed: DisclosedField[],
  extras?: Pick<Partial<CredentialView>, "id">,
): Partial<CredentialView> {
  const view: Partial<CredentialView> = extras?.id ? { id: extras.id } : {};
  for (const field of disclosed) {
    const key = CREDENTIAL_FIELD_BY_DISCLOSURE_ID[field.id];
    if (!key) continue;
    assignCredentialField(view, key, field.value);
  }
  return view;
}

function assignCredentialField(
  view: Partial<CredentialView>,
  key: keyof CredentialView,
  value: string,
): void {
  if (key === "type" || key === "supportingRecords" || key === "proof") return;
  if (key === "anchorTxId" || key === "anchoredAt" || key === "anchorStatus") return;
  view[key] = value;
}

export function candidateFromDisclosedShares(params: {
  candidateId: string;
  displayedName: string;
  shares: Array<{
    skill: string | null;
    disclosedFields: DisclosedField[];
    disclosedPayload: Record<string, unknown>;
  }>;
}): {
  id: string;
  name: string;
  topSkill: string;
  evidence: number;
  reviews: number;
  attestation: "Approved" | "Partial" | "Pending";
  institution: string;
  credentialCount: number;
  sharedCredentials: typeof params.shares;
} {
  const topSkill = params.shares.find((item) => item.skill)?.skill ?? "—";
  const institution = params.shares
    .flatMap((item) => item.disclosedFields)
    .find((field) => field.id === "issuer" || field.id === "institution")
    ?.value ?? "—";

  return {
    id: params.candidateId,
    name: params.displayedName,
    topSkill,
    evidence: params.shares.reduce(
      (total, item) => total + Object.keys(item.disclosedPayload).length,
      0,
    ),
    reviews: 0,
    attestation: "Pending",
    institution,
    credentialCount: params.shares.length,
    sharedCredentials: params.shares,
  };
}
