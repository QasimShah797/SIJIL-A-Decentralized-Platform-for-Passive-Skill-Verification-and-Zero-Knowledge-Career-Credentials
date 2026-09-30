import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { canonicalizeJson } from "../utils/canonicalize";
import { buildCredentialDocument } from "./credential-document.service";
import { signSha256Hash, verifySha256Hash } from "../utils/ed25519";

type Rfc8785Vector = {
  input: unknown;
  canonical: string;
};

const vectorPath = path.resolve(__dirname, "../../../shared/rfc8785-test-vector.json");
const vector = JSON.parse(readFileSync(vectorPath, "utf8")) as Rfc8785Vector;

const sampleInput = {
  credentialUri: "urn:uuid:sijil:test-cred",
  issuerDid: "did:web:issuer.cust.edu.pk",
  holderDid: "did:key:z6Mktest",
  skill: "TypeScript",
  evidenceCount: 3,
  validFrom: "2026-01-15T00:00:00.000Z",
};

describe("credential integrity", () => {
  it("matches the shared RFC 8785 test vector (backend + edge function)", () => {
    assert.equal(canonicalizeJson(vector.input), vector.canonical);
  });

  it("includes sorted evidence hashes in the unsigned document", () => {
    const built = buildCredentialDocument({
      ...sampleInput,
      evidenceHashes: ["bb", "aa"],
    });
    assert.deepEqual(built.document.credentialSubject.evidenceHashes, ["aa", "bb"]);
  });

  it("produces the same hash for the same credential document", () => {
    const first = buildCredentialDocument(sampleInput);
    const second = buildCredentialDocument(sampleInput);
    assert.equal(first.canonicalJson, second.canonicalJson);
    assert.equal(first.sha256Hash, second.sha256Hash);
    assert.equal(first.canonicalJson.includes("proof"), false);
  });

  it("changes the hash when a credential field is tampered", () => {
    const original = buildCredentialDocument(sampleInput);
    const tampered = buildCredentialDocument({ ...sampleInput, skill: "Java" });
    assert.notEqual(original.sha256Hash, tampered.sha256Hash);
  });

  it("verifies a valid Ed25519 signature over the hash", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const { sha256Hash } = buildCredentialDocument(sampleInput);
    const proofValue = signSha256Hash(sha256Hash, privatePem);
    assert.equal(verifySha256Hash(sha256Hash, proofValue, publicPem), true);
  });

  it("rejects a tampered signature", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const { sha256Hash } = buildCredentialDocument(sampleInput);
    const proofValue = signSha256Hash(sha256Hash, privatePem);
    const buf = Buffer.from(proofValue, "base64url");
    buf[0] ^= 0xff;
    const flipped = buf.toString("base64url");
    assert.equal(verifySha256Hash(sha256Hash, flipped, publicPem), false);
  });
});
