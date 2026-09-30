/**
 * Builds the unsigned W3C Verifiable Credential document used for hashing and signing.
 */
import { canonicalizeJson } from "../utils/canonicalize";
import { generateSha256Hash } from "../utils/generateHash";

export const CREDENTIAL_CONTEXT = "https://www.w3.org/ns/credentials/v2";

export interface CredentialDocumentInput {
  credentialUri: string;
  issuerDid: string;
  holderDid: string;
  skill: string;
  evidenceCount: number;
  evidenceHashes?: string[];
  validFrom: string;
  types?: string[];
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
  };
}

export interface CanonicalCredentialDocument {
  document: CredentialDocument;
  canonicalJson: string;
  sha256Hash: string;
}

export function buildCredentialDocument(input: CredentialDocumentInput): CanonicalCredentialDocument {
  const evidenceHashes = [...(input.evidenceHashes ?? [])].filter((hash) => hash.length > 0).sort();
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
    },
  };

  const canonicalJson = canonicalizeJson(document);
  return {
    document,
    canonicalJson,
    sha256Hash: generateSha256Hash(canonicalJson),
  };
}
