/**
 * Mock cryptographic proof generation for verifiable credentials.
 * Future: replace with real ZKP / blockchain anchoring.
 */
import { generateProofHash } from "../utils/generateHash";

export interface ProofPayload {
  type: string;
  cryptosuite: string;
  created: string;
  verificationMethod: string;
  proofValue: string;
  proofPurpose: string;
}

export function buildCredentialProof(params: {
  credentialUri: string;
  issuerDid: string;
  holderDid: string;
  skillName: string;
}): ProofPayload {
  const proofValue = generateProofHash({
    credentialUri: params.credentialUri,
    issuerDid: params.issuerDid,
    holderDid: params.holderDid,
    skillName: params.skillName,
  });

  return {
    type: "DataIntegrityProof",
    cryptosuite: "sha256-2024-mock",
    created: new Date().toISOString(),
    verificationMethod: `${params.issuerDid}#key-1`,
    proofValue: `0x${proofValue}`,
    proofPurpose: "assertionMethod",
  };
}
