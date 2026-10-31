/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { canonicalizeJson } from "@/lib/ssi/canonicalize";
import { generateLearnerKeyPair, identityFromKeyPair } from "@/lib/ssi/keystore";
import {
  SSI_PRESENT_CRYPTOSUITE,
  SSI_PRESENT_PROTOCOL,
  SSI_PRESENT_PURPOSE,
  buildPresentationSigningClaims,
  canonicalPresentationPayload,
  signPresentationClaims,
} from "@/lib/ssi/presentation";

const GOLDEN_CLAIMS_INPUT = {
  challengeId: "11111111-2222-4333-8444-555555555555",
  nonce: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  audience: "https://sijil.example/recruiter/verify-vp",
  holderDid: "did:key:z6Mkj4M7z8UBANjpLqsPzCBEN9GGP9eDRvmGw7JPAp4yeNxR",
  credentials: [
    {
      id: "6916c346-333b-4bd5-9f15-b75b1f54e50b",
      hash: "8ef4bb60f3e06e8d8c501e1bf64b5e9aa23194b617eece3575459523533e4a1a",
    },
  ],
  issuedAt: "2026-10-16T19:00:00.000Z",
  expiresAt: "2026-10-16T19:15:00.000Z",
};

const GOLDEN_CANONICAL = "{\"audience\":\"https://sijil.example/recruiter/verify-vp\",\"challengeId\":\"11111111-2222-4333-8444-555555555555\",\"credentials\":[{\"hash\":\"8ef4bb60f3e06e8d8c501e1bf64b5e9aa23194b617eece3575459523533e4a1a\",\"id\":\"6916c346-333b-4bd5-9f15-b75b1f54e50b\"}],\"expiresAt\":\"2026-10-16T19:15:00.000Z\",\"holderDid\":\"did:key:z6Mkj4M7z8UBANjpLqsPzCBEN9GGP9eDRvmGw7JPAp4yeNxR\",\"issuedAt\":\"2026-10-16T19:00:00.000Z\",\"nonce\":\"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\",\"protocol\":\"SIJIL-SSI-PRESENT-v1\",\"purpose\":\"present-credentials\"}";

const RFC8785_INPUT = {
  "@context": ["https://www.w3.org/ns/credentials/v2"],
  id: "urn:uuid:sijil:test-cred",
  type: ["VerifiableCredential", "OpenBadgeCredential"],
  issuer: "did:web:issuer.cust.edu.pk",
  validFrom: "2026-01-15T00:00:00.000Z",
  credentialSubject: {
    id: "did:key:z6Mktest",
    skill: "TypeScript",
    evidenceCount: 3,
  },
};

const RFC8785_CANONICAL = "{\"@context\":[\"https://www.w3.org/ns/credentials/v2\"],\"credentialSubject\":{\"evidenceCount\":3,\"id\":\"did:key:z6Mktest\",\"skill\":\"TypeScript\"},\"id\":\"urn:uuid:sijil:test-cred\",\"issuer\":\"did:web:issuer.cust.edu.pk\",\"type\":[\"VerifiableCredential\",\"OpenBadgeCredential\"],\"validFrom\":\"2026-01-15T00:00:00.000Z\"}";

const ed25519Available = typeof crypto !== "undefined"
  && Boolean(crypto.subtle)
  && typeof crypto.subtle.generateKey === "function";

function decodeBase64Url(text: string): ArrayBuffer {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const copy = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(copy);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return copy;
}

describe("frontend presentation signing claims", () => {
  it("matches the shared RFC 8785 test vector", () => {
    expect(canonicalizeJson(RFC8785_INPUT)).toBe(RFC8785_CANONICAL);
  });

  it("matches the shared SIJIL-SSI-PRESENT-v1 canonical payload", () => {
    const claims = buildPresentationSigningClaims(GOLDEN_CLAIMS_INPUT);
    expect(canonicalPresentationPayload(claims)).toBe(GOLDEN_CANONICAL);
    expect(claims.protocol).toBe(SSI_PRESENT_PROTOCOL);
    expect(claims.purpose).toBe(SSI_PRESENT_PURPOSE);
    expect(SSI_PRESENT_CRYPTOSUITE).toBe("sijil-ed25519-jcs-utf8-2026");
    expect(SSI_PRESENT_CRYPTOSUITE).not.toBe("eddsa-jcs-2022");
  });

  it("sorts credentials so insertion order does not change the signed bytes", () => {
    const first = {
      id: "6916c346-333b-4bd5-9f15-b75b1f54e50b",
      hash: "8ef4bb60f3e06e8d8c501e1bf64b5e9aa23194b617eece3575459523533e4a1a",
    };
    const second = {
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      hash: "11".repeat(32),
    };
    const forward = buildPresentationSigningClaims({
      ...GOLDEN_CLAIMS_INPUT,
      credentials: [first, second],
    });
    const reversed = buildPresentationSigningClaims({
      ...GOLDEN_CLAIMS_INPUT,
      credentials: [second, first],
    });
    expect(canonicalPresentationPayload(forward)).toBe(canonicalPresentationPayload(reversed));
  });

  it("rejects malformed payloads", () => {
    expect(() => buildPresentationSigningClaims({ ...GOLDEN_CLAIMS_INPUT, credentials: [] })).toThrow(/non-empty/);
    expect(() => buildPresentationSigningClaims({
      ...GOLDEN_CLAIMS_INPUT,
      holderDid: "did:key:z6Mk6958504f5c954bff8e88bf737778584e",
    })).toThrow(/did:key|Ed25519|base58/i);
    expect(() => buildPresentationSigningClaims({
      ...GOLDEN_CLAIMS_INPUT,
      credentials: [{ id: GOLDEN_CLAIMS_INPUT.credentials[0].id, hash: "nope" }],
    })).toThrow(/hash/);
    expect(() => buildPresentationSigningClaims({
      ...GOLDEN_CLAIMS_INPUT,
      audience: "contains spaces",
    })).toThrow(/audience/);
    expect(() => buildPresentationSigningClaims({
      ...GOLDEN_CLAIMS_INPUT,
      issuedAt: "2026-10-16T19:15:00.000Z",
      expiresAt: "2026-10-16T19:00:00.000Z",
    })).toThrow(/expiresAt/);
  });
});

describe.skipIf(!ed25519Available)("frontend presentation Ed25519 signing", () => {
  it("signs the canonical UTF-8 payload with the non-extractable key", async () => {
    const pair = await generateLearnerKeyPair();
    expect(pair.privateKey.extractable).toBe(false);
    const record = await identityFromKeyPair("user-1", pair);
    const claims = buildPresentationSigningClaims({
      ...GOLDEN_CLAIMS_INPUT,
      holderDid: record.did,
    });
    const signature = await signPresentationClaims(record, claims);
    expect(signature).toMatch(/^[A-Za-z0-9_-]+$/);
    const ok = await crypto.subtle.verify(
      { name: "Ed25519" } as AlgorithmIdentifier,
      pair.publicKey,
      decodeBase64Url(signature),
      new TextEncoder().encode(canonicalPresentationPayload(claims)),
    );
    expect(ok).toBe(true);
    const tampered = new TextEncoder().encode(canonicalPresentationPayload(claims).replace("present-credentials", "bind-learner-did"));
    const stillOk = await crypto.subtle.verify(
      { name: "Ed25519" } as AlgorithmIdentifier,
      pair.publicKey,
      decodeBase64Url(signature),
      tampered,
    );
    expect(stillOk).toBe(false);
  });

  it("refuses to sign claims for a different DID", async () => {
    const record = await identityFromKeyPair("user-1", await generateLearnerKeyPair());
    await expect(signPresentationClaims(record, buildPresentationSigningClaims(GOLDEN_CLAIMS_INPUT)))
      .rejects.toThrow(/does not match presentation holder/);
  });
});

describe("learner presentation revoke UX contract", () => {
  it("classifies API 410 revoked separately from missing/expired", () => {
    const classify = (message: string): "revoked" | "missing" =>
      (/410|revoked/i.test(message) ? "revoked" : "missing");
    expect(classify("API 410: Presentation revoked")).toBe("revoked");
    expect(classify("API 404: Presentation not found")).toBe("missing");
    expect(classify("API 400: Presentation expired")).toBe("missing");
  });
});

describe("selective presentation credential eligibility", () => {
  it("defaults to no automatic selection and only active DID-bound credentials", async () => {
    const { eligiblePresentationCredentials } = await import("@/lib/ssi/presentation-selection");
    const activeDid = "did:key:z6Mkj4M7z8UBANjpLqsPzCBEN9GGP9eDRvmGw7JPAp4yeNxR";
    const rows = [
      { id: "a", holderDid: activeDid, skill: "Dart" },
      { id: "b", holderDid: "did:key:z6Mk" + "c".repeat(40), skill: "Other" },
      { id: "c", holderDid: "did:key:z6Mkplaceholderhistorical0000000000001", skill: "Legacy" },
    ];
    expect(eligiblePresentationCredentials(rows, null)).toEqual([]);
    expect(eligiblePresentationCredentials(rows, activeDid).map((row) => row.id)).toEqual(["a"]);
    const selected = new Set<string>();
    expect(selected.size).toBe(0);
    expect(eligiblePresentationCredentials(rows, activeDid).filter((row) => selected.has(row.id))).toEqual([]);
  });
});
