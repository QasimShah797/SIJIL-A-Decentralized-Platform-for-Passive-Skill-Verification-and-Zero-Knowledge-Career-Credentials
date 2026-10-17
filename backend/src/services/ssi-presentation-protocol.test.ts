import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { generateKeyPairSync, sign } from "node:crypto";
import { encodeDidKeyFromRawPublicKey } from "../utils/did-key";
import { signSha256Hash, verifySha256Hash } from "../utils/ed25519";
import { canonicalizeJson } from "../utils/canonicalize";
import { generateSha256Hash } from "../utils/generateHash";
import { buildCredentialDocument, type CredentialDocument } from "./credential-document.service";
import {
  SSI_PRESENT_CRYPTOSUITE,
  SSI_PRESENT_PROTOCOL,
  SSI_PRESENT_PURPOSE,
  buildPresentationEnvelope,
  buildPresentationSigningClaims,
  canonicalPresentationPayload,
  hashUnsignedCredentialDocument,
  presentationSignBytes,
  verifyPresentationProof,
  type IssuerCredentialProof,
} from "./ssi-presentation-protocol";

const ISSUER_PROOF_TYPE = "DataIntegrityProof";
const ISSUER_CRYPTOSUITE = "eddsa-jcs-2022";

type PresentVector = {
  claims: {
    challengeId: string;
    nonce: string;
    audience: string;
    holderDid: string;
    credentials: Array<{ id: string; hash: string }>;
    issuedAt: string;
    expiresAt: string;
  };
  canonical: string;
};

const vectorPath = path.resolve(__dirname, "../../../shared/sijil-present-v1-vector.json");
const vector = JSON.parse(readFileSync(vectorPath, "utf8")) as PresentVector;

const DART_ID = "6916c346-333b-4bd5-9f15-b75b1f54e50b";
const OTHER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function learnerKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const raw = new Uint8Array(der.subarray(der.byteLength - 32));
  return {
    privateKey,
    did: encodeDidKeyFromRawPublicKey(raw),
    publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

function issuerKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

function issuedCredential(holderDid: string, skill = "Dart"): {
  id: string;
  document: CredentialDocument;
  proof: IssuerCredentialProof;
  hash: string;
  issuer: ReturnType<typeof issuerKeys>;
} {
  const issuer = issuerKeys();
  const issuerDid = "did:web:issuer.cust.edu.pk";
  const built = buildCredentialDocument({
    credentialUri: `urn:uuid:sijil:test:${skill.toLowerCase()}`,
    issuerDid,
    holderDid,
    skill,
    evidenceCount: 1,
    evidenceHashes: ["aa".repeat(32)],
    validFrom: "2026-10-16T18:00:00.000Z",
  });
  const proofValue = signSha256Hash(built.sha256Hash, issuer.privatePem);
  return {
    id: skill === "Dart" ? DART_ID : OTHER_ID,
    document: built.document,
    hash: built.sha256Hash,
    issuer,
    proof: {
      type: ISSUER_PROOF_TYPE,
      cryptosuite: ISSUER_CRYPTOSUITE,
      created: built.document.validFrom,
      verificationMethod: `${issuerDid}#key-1`,
      proofValue,
      proofPurpose: "assertionMethod",
    },
  };
}

function claimsFor(
  holderDid: string,
  credentials: Array<{ id: string; hash: string }>,
  overrides: Partial<{
    challengeId: string;
    nonce: string;
    audience: string;
    issuedAt: string;
    expiresAt: string;
  }> = {},
) {
  return buildPresentationSigningClaims({
    challengeId: overrides.challengeId ?? "11111111-2222-4333-8444-555555555555",
    nonce: overrides.nonce ?? "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    audience: overrides.audience ?? "https://sijil.example/recruiter/verify-vp",
    holderDid,
    credentials,
    issuedAt: overrides.issuedAt ?? "2026-10-16T19:00:00.000Z",
    expiresAt: overrides.expiresAt ?? "2026-10-16T19:15:00.000Z",
  });
}

function signClaims(privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"], claims: ReturnType<typeof claimsFor>) {
  return sign(null, presentationSignBytes(claims), privateKey).toString("base64url");
}

function signedEnvelope(holder = learnerKeys()) {
  const issued = issuedCredential(holder.did);
  const claims = claimsFor(holder.did, [{ id: issued.id, hash: issued.hash }]);
  const envelope = buildPresentationEnvelope({
    claims,
    credentials: [issued],
    proofValue: signClaims(holder.privateKey, claims),
  });
  return { holder, issued, claims, envelope };
}

describe("SSI presentation protocol", () => {
  it("matches the shared JCS vector (frontend and backend sign the same UTF-8 bytes)", () => {
    const claims = buildPresentationSigningClaims(vector.claims);
    assert.equal(canonicalPresentationPayload(claims), vector.canonical);
    assert.equal(presentationSignBytes(claims).toString("utf8"), vector.canonical);
    assert.equal(claims.protocol, SSI_PRESENT_PROTOCOL);
    assert.equal(claims.purpose, SSI_PRESENT_PURPOSE);
  });

  it("canonicalizes credential order so shuffled IDs produce the same payload", () => {
    const holder = learnerKeys();
    const first = issuedCredential(holder.did, "Dart");
    const second = issuedCredential(holder.did, "TypeScript");
    const forward = claimsFor(holder.did, [
      { id: first.id, hash: first.hash },
      { id: second.id, hash: second.hash },
    ]);
    const reversed = claimsFor(holder.did, [
      { id: second.id, hash: second.hash },
      { id: first.id, hash: first.hash },
    ]);
    assert.equal(canonicalPresentationPayload(forward), canonicalPresentationPayload(reversed));
    assert.deepEqual(forward.credentials.map((row) => row.id), [...[first.id, second.id].sort()]);
  });

  it("accepts a valid learner Ed25519 signature over the canonical payload", () => {
    const { envelope, claims } = signedEnvelope();
    const verified = verifyPresentationProof(envelope, new Date("2026-10-16T19:01:00.000Z"));
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    assert.equal(verified.claims.holderDid, claims.holderDid);
    assert.equal(verified.claims.credentials[0]?.hash, claims.credentials[0]?.hash);
    assert.equal(envelope.proof.cryptosuite, SSI_PRESENT_CRYPTOSUITE);
    assert.notEqual(envelope.proof.cryptosuite, ISSUER_CRYPTOSUITE);
  });

  it("rejects an invalid signature", () => {
    const { envelope } = signedEnvelope();
    const buf = Buffer.from(envelope.proof.proofValue, "base64url");
    buf[0] ^= 0xff;
    envelope.proof.proofValue = buf.toString("base64url");
    const verified = verifyPresentationProof(envelope, new Date("2026-10-16T19:01:00.000Z"));
    assert.equal(verified.ok, false);
    if (verified.ok) return;
    assert.equal(verified.reason, "invalid_signature");
  });

  it("rejects a modified challenge id", () => {
    const { envelope } = signedEnvelope();
    envelope.proof.challenge = "99999999-2222-4333-8444-555555555555";
    const verified = verifyPresentationProof(envelope, new Date("2026-10-16T19:01:00.000Z"));
    assert.equal(verified.ok, false);
    if (verified.ok) return;
    assert.equal(verified.reason, "invalid_signature");
  });

  it("rejects a modified audience", () => {
    const { envelope } = signedEnvelope();
    envelope.proof.domain = "https://attacker.example/verify";
    const verified = verifyPresentationProof(envelope, new Date("2026-10-16T19:01:00.000Z"));
    assert.equal(verified.ok, false);
    if (verified.ok) return;
    assert.equal(verified.reason, "invalid_signature");
  });

  it("rejects a modified credential id", () => {
    const { envelope } = signedEnvelope();
    envelope.sijilCredentialIds[0] = OTHER_ID;
    const verified = verifyPresentationProof(envelope, new Date("2026-10-16T19:01:00.000Z"));
    assert.equal(verified.ok, false);
    if (verified.ok) return;
    assert.equal(verified.reason, "invalid_signature");
  });

  it("rejects substitution of a different credential document (hash binding)", () => {
    const { envelope, issued, holder } = signedEnvelope();
    const other = issuedCredential(holder.did, "TypeScript");
    envelope.verifiableCredential[0] = {
      ...other.document,
      proof: other.proof,
    };
    const verified = verifyPresentationProof(envelope, new Date("2026-10-16T19:01:00.000Z"));
    assert.equal(verified.ok, false);
    if (verified.ok) return;
    assert.equal(verified.reason, "invalid_signature");
    assert.notEqual(other.hash, issued.hash);
  });

  it("rejects a wrong holder DID", () => {
    const { envelope } = signedEnvelope();
    const other = learnerKeys();
    envelope.holder = other.did;
    envelope.proof.verificationMethod = `${other.did}#${other.did.slice("did:key:".length)}`;
    envelope.verifiableCredential[0].credentialSubject.id = other.did;
    const verified = verifyPresentationProof(envelope, new Date("2026-10-16T19:01:00.000Z"));
    assert.equal(verified.ok, false);
    if (verified.ok) return;
    assert.equal(verified.reason, "invalid_signature");
  });

  it("rejects an expired challenge", () => {
    const { envelope } = signedEnvelope();
    const verified = verifyPresentationProof(envelope, new Date("2026-10-16T19:15:00.000Z"));
    assert.equal(verified.ok, false);
    if (verified.ok) return;
    assert.equal(verified.reason, "expired");
  });

  it("rejects malformed payloads", () => {
    const holder = learnerKeys();
    const issued = issuedCredential(holder.did);
    assert.throws(
      () => claimsFor(holder.did, []),
      /non-empty/,
    );
    assert.throws(
      () => claimsFor("did:key:z6Mk6958504f5c954bff8e88bf737778584e", [{ id: issued.id, hash: issued.hash }]),
      /did:key|holderDid/,
    );
    assert.throws(
      () => claimsFor(holder.did, [{ id: issued.id, hash: "not-a-hash" }]),
      /hash/,
    );
    assert.throws(
      () => claimsFor(holder.did, [{ id: issued.id, hash: issued.hash }], { audience: "not a url with spaces" }),
      /audience/,
    );
    assert.throws(
      () => claimsFor(holder.did, [{ id: issued.id, hash: issued.hash }], {
        issuedAt: "2026-10-16T19:15:00.000Z",
        expiresAt: "2026-10-16T19:00:00.000Z",
      }),
      /expiresAt/,
    );
    assert.throws(
      () => claimsFor(holder.did, [
        { id: issued.id, hash: issued.hash },
        { id: issued.id, hash: "bb".repeat(32) },
      ]),
      /unique/,
    );

    const { envelope } = signedEnvelope(holder);
    (envelope.proof as { cryptosuite: string }).cryptosuite = ISSUER_CRYPTOSUITE;
    const verified = verifyPresentationProof(envelope, new Date("2026-10-16T19:01:00.000Z"));
    assert.equal(verified.ok, false);
    if (verified.ok) return;
    assert.equal(verified.reason, "malformed");
  });

  it("embeds issuer proofs without changing the unsigned document hash or issuer signature format", () => {
    const { envelope, issued } = signedEnvelope();
    const embedded = envelope.verifiableCredential[0];
    assert.ok(embedded);
    const { proof, ...document } = embedded;
    assert.equal(hashUnsignedCredentialDocument(document), issued.hash);
    assert.equal(generateSha256Hash(canonicalizeJson(document)), issued.hash);
    assert.deepEqual(proof, issued.proof);
    assert.equal(proof.type, ISSUER_PROOF_TYPE);
    assert.equal(proof.cryptosuite, ISSUER_CRYPTOSUITE);
    assert.equal(verifySha256Hash(issued.hash, proof.proofValue, issued.issuer.publicPem), true);
  });

  it("does not treat a holder UTF-8 signature as an issuer hash signature", () => {
    const { envelope, claims, holder } = signedEnvelope();
    const digest = generateSha256Hash(canonicalPresentationPayload(claims));
    assert.equal(verifySha256Hash(digest, envelope.proof.proofValue, holder.publicPem), false);
  });
});
