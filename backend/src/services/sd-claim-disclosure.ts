/**
 * Issuer-bound claim-digest selective disclosure (SD-claim-digest-v1).
 *
 * Hideable claims are committed as SHA-256(salt || claimId || value) digests inside
 * an issuer-signed credential document (selectiveDisclosure.sd). At share time the
 * holder releases (claimId, value, salt) for selected claims only. The verifier:
 *  1) verifies the issuer Ed25519 DataIntegrityProof on the credential shell
 *  2) recomputes digests for each disclosure and checks membership in signed `sd`
 *  3) rejects disclosures for claims not in the signed set
 *
 * Legacy credentials without selectiveDisclosure use disclosureScheme
 * "legacy-application-filter" and must not be labeled cryptographic SD.
 */
import { createHash, randomBytes } from "node:crypto";
import { canonicalizeJson } from "../utils/canonicalize";
import { generateSha256Hash } from "../utils/generateHash";
import type { CredentialDocument } from "./credential-document.service";

export const SD_SCHEME_CRYPTO = "sd-claim-digest-v1" as const;
export const SD_SCHEME_LEGACY = "legacy-application-filter" as const;
export const SD_ALG = "sha-256" as const;

export type DisclosureScheme = typeof SD_SCHEME_CRYPTO | typeof SD_SCHEME_LEGACY;

export type SdClaimId =
  | "learner_name"
  | "competency_name"
  | "issue_date"
  | "verification_status"
  | "credential_metadata"
  | "github_summary"
  | "lms_summary"
  | "practical_summary"
  | "peer_summary";

export type SdDisclosure = {
  claimId: SdClaimId | string;
  value: string;
  salt: string;
};

export type SelectiveDisclosureManifest = {
  alg: typeof SD_ALG;
  scheme: typeof SD_SCHEME_CRYPTO;
  /** Sorted unique digests committed inside the issuer-signed document. */
  sd: string[];
};

export type SdPresentationBundle = {
  disclosureScheme: DisclosureScheme;
  credentialId: string;
  credentialHash: string | null;
  issuerDid: string | null;
  holderDid: string | null;
  /** Present only for sd-claim-digest-v1 shares. */
  disclosures?: SdDisclosure[];
  /** Digests still hidden (not released). */
  withheldDigests?: string[];
  issuerSignatureCheck: "valid" | "invalid" | "missing" | "legacy_not_applicable";
  note: string;
};

function digestClaim(salt: string, claimId: string, value: string): string {
  return createHash("sha256")
    .update(`${salt}\n${claimId}\n${value}`, "utf8")
    .digest("hex");
}

export function createClaimSalt(): string {
  return randomBytes(16).toString("base64url");
}

export function buildSelectiveDisclosureManifest(
  claims: Array<{ claimId: string; value: string; salt: string }>,
): SelectiveDisclosureManifest {
  const sd = [...new Set(claims.map((c) => digestClaim(c.salt, c.claimId, c.value)))].sort();
  return { alg: SD_ALG, scheme: SD_SCHEME_CRYPTO, sd };
}

export function attachSelectiveDisclosureToDocument(
  document: CredentialDocument,
  manifest: SelectiveDisclosureManifest,
  /** Salts stay server-side at issuance; never put in the signed public document. */
): CredentialDocument & { selectiveDisclosure: SelectiveDisclosureManifest } {
  return {
    ...document,
    selectiveDisclosure: {
      alg: manifest.alg,
      scheme: manifest.scheme,
      sd: [...manifest.sd],
    },
  };
}

export function readSelectiveDisclosureManifest(document: unknown): SelectiveDisclosureManifest | null {
  if (!document || typeof document !== "object") return null;
  const sdBlock = (document as Record<string, unknown>).selectiveDisclosure;
  if (!sdBlock || typeof sdBlock !== "object") return null;
  const record = sdBlock as Record<string, unknown>;
  if (record.scheme !== SD_SCHEME_CRYPTO || record.alg !== SD_ALG) return null;
  if (!Array.isArray(record.sd)) return null;
  const digests = record.sd.filter((item): item is string => typeof item === "string" && /^[0-9a-f]{64}$/.test(item));
  if (digests.length === 0) return null;
  return { alg: SD_ALG, scheme: SD_SCHEME_CRYPTO, sd: [...digests].sort() };
}

export function verifyDisclosuresAgainstManifest(
  manifest: SelectiveDisclosureManifest,
  disclosures: SdDisclosure[],
): { ok: true; releasedDigests: string[]; withheldDigests: string[] } | { ok: false; reason: string } {
  const signed = new Set(manifest.sd);
  const released: string[] = [];
  for (const item of disclosures) {
    if (!item.claimId || typeof item.value !== "string" || typeof item.salt !== "string") {
      return { ok: false, reason: "malformed_disclosure" };
    }
    const digest = digestClaim(item.salt, item.claimId, item.value);
    if (!signed.has(digest)) {
      return { ok: false, reason: "digest_not_in_signed_manifest" };
    }
    released.push(digest);
  }
  const releasedSet = new Set(released);
  const withheld = manifest.sd.filter((d) => !releasedSet.has(d));
  return { ok: true, releasedDigests: released, withheldDigests: withheld };
}

export function legacySdBundle(params: {
  credentialId: string;
  credentialHash: string | null;
  issuerDid: string | null;
  holderDid: string | null;
}): SdPresentationBundle {
  return {
    disclosureScheme: SD_SCHEME_LEGACY,
    credentialId: params.credentialId,
    credentialHash: params.credentialHash,
    issuerDid: params.issuerDid,
    holderDid: params.holderDid,
    issuerSignatureCheck: "legacy_not_applicable",
    note: "Legacy application-level field filtering. Not cryptographic selective disclosure.",
  };
}

export function cryptoSdBundle(params: {
  credentialId: string;
  credentialHash: string | null;
  issuerDid: string | null;
  holderDid: string | null;
  disclosures: SdDisclosure[];
  withheldDigests: string[];
  issuerSignatureCheck: SdPresentationBundle["issuerSignatureCheck"];
}): SdPresentationBundle {
  return {
    disclosureScheme: SD_SCHEME_CRYPTO,
    credentialId: params.credentialId,
    credentialHash: params.credentialHash,
    issuerDid: params.issuerDid,
    holderDid: params.holderDid,
    disclosures: params.disclosures,
    withheldDigests: params.withheldDigests,
    issuerSignatureCheck: params.issuerSignatureCheck,
    note: "Issuer-bound claim digests verified against the signed selectiveDisclosure.sd set.",
  };
}

/** Stable JSON for hashing presentation SD metadata (excludes salts of withheld claims). */
export function hashSdBundlePublic(bundle: SdPresentationBundle): string {
  const publicView = {
    disclosureScheme: bundle.disclosureScheme,
    credentialId: bundle.credentialId,
    credentialHash: bundle.credentialHash,
    issuerDid: bundle.issuerDid,
    holderDid: bundle.holderDid,
    claimIds: (bundle.disclosures ?? []).map((d) => d.claimId).sort(),
    withheldCount: bundle.withheldDigests?.length ?? 0,
    issuerSignatureCheck: bundle.issuerSignatureCheck,
  };
  return generateSha256Hash(canonicalizeJson(publicView));
}
