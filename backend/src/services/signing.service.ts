/**
 * Ed25519 issuer signing using env-configured keys.
 */
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { decodeIssuerPem, signSha256Hash, verifySha256Hash } from "../utils/ed25519";

export const CREDENTIAL_CRYPTOSUITE = "eddsa-jcs-2022";
export const CREDENTIAL_PROOF_TYPE = "DataIntegrityProof";

export { decodeIssuerPem, signSha256Hash, verifySha256Hash };

function requirePrivateKeyPem(): string {
  if (!env.ISSUER_ED25519_PRIVATE_KEY) {
    throw new AppError("ISSUER_ED25519_PRIVATE_KEY is not configured", 503);
  }
  return decodeIssuerPem(env.ISSUER_ED25519_PRIVATE_KEY);
}

function requirePublicKeyPem(): string {
  if (!env.ISSUER_ED25519_PUBLIC_KEY) {
    throw new AppError("ISSUER_ED25519_PUBLIC_KEY is not configured", 503);
  }
  return decodeIssuerPem(env.ISSUER_ED25519_PUBLIC_KEY);
}

export function signCredentialHash(hashHex: string): string {
  return signSha256Hash(hashHex, requirePrivateKeyPem());
}

export function verifyCredentialHash(hashHex: string, proofValue: string): boolean {
  return verifySha256Hash(hashHex, proofValue, requirePublicKeyPem());
}

export function issuerVerificationMethod(issuerDid: string): string {
  return `${issuerDid}#key-1`;
}

export function getIssuerPublicMaterial(did: string): {
  did: string;
  verificationMethod: string;
  publicKeyPem: string;
  cryptosuite: typeof CREDENTIAL_CRYPTOSUITE;
} {
  const publicKeyPem = requirePublicKeyPem();
  return {
    did,
    verificationMethod: issuerVerificationMethod(did),
    publicKeyPem,
    cryptosuite: CREDENTIAL_CRYPTOSUITE,
  };
}
