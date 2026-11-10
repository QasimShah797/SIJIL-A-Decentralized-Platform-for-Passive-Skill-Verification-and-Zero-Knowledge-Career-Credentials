/**
 * Builds the unsigned W3C Verifiable Credential document used for hashing and signing.
 */
import { canonicalizeJson } from "../utils/canonicalize";
import { generateSha256Hash } from "../utils/generateHash";

export const CREDENTIAL_CONTEXT = "https://www.w3.org/ns/credentials/v2";

export interface AssessmentCommitmentClaim {
  version: number;
  scheme: string;
  circuitId: string;
  attemptId: string;
  commitment: string;
}

export interface CredentialDocumentInput {
  credentialUri: string;
  issuerDid: string;
  holderDid: string;
  skill: string;
  evidenceCount: number;
  evidenceHashes?: string[];
  validFrom: string;
  types?: string[];
  assessmentCommitment?: AssessmentCommitmentClaim;
}

export interface CredentialDocument {
  "@context": string[];
  id: string;
  type: string[];
  issuer: string;
  validFrom: string;
  credentialSubject: {
    id: string;
    skill: string;
    evidenceCount: number;
    evidenceHashes: string[];
    assessmentCommitment?: AssessmentCommitmentClaim;
  };
}

export interface CanonicalCredentialDocument {
  document: CredentialDocument;
  canonicalJson: string;
  sha256Hash: string;
}

function publicAssessmentCommitment(
  claim: AssessmentCommitmentClaim | undefined,
): AssessmentCommitmentClaim | undefined {
  if (!claim) return undefined;
  return {
    version: claim.version,
    scheme: claim.scheme,
    circuitId: claim.circuitId,
    attemptId: claim.attemptId,
    commitment: claim.commitment,
  };
}

export function buildCredentialDocument(input: CredentialDocumentInput): CanonicalCredentialDocument {
  const evidenceHashes = [...(input.evidenceHashes ?? [])].filter((hash) => hash.length > 0).sort();
  const assessmentCommitment = publicAssessmentCommitment(input.assessmentCommitment);
  const document: CredentialDocument = {
    "@context": [CREDENTIAL_CONTEXT],
    id: input.credentialUri,
    type: input.types ?? ["VerifiableCredential", "OpenBadgeCredential"],
    issuer: input.issuerDid,
    validFrom: input.validFrom,
    credentialSubject: {
      id: input.holderDid,
      skill: input.skill,
      evidenceCount: input.evidenceCount,
      evidenceHashes,
      ...(assessmentCommitment ? { assessmentCommitment } : {}),
    },
  };

  const canonicalJson = canonicalizeJson(document);
  return {
    document,
    canonicalJson,
    sha256Hash: generateSha256Hash(canonicalJson),
  };
}
