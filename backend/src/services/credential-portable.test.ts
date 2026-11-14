import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCredentialDocument } from "./credential-document.service";
import { portableCredentialFromStored } from "./credential-portable";

const built = buildCredentialDocument({
  credentialUri: "urn:uuid:sijil:test-cred",
  issuerDid: "did:web:issuer.cust.edu.pk",
  holderDid: "did:key:z6Mktest",
  skill: "TypeScript",
  evidenceCount: 1,
  evidenceHashes: ["aa"],
  validFrom: "2026-01-15T00:00:00.000Z",
});

const proof = {
  type: "DataIntegrityProof",
  cryptosuite: "eddsa-jcs-2022",
  created: "2026-01-15T00:00:00.000Z",
  verificationMethod: "did:web:issuer.cust.edu.pk#key-1",
  proofValue: "abc",
  proofPurpose: "assertionMethod",
  privateKey: "do-not-export",
};

describe("portable credential export", () => {
  it("copies the stored document, proof, and hash without private material", () => {
    const file = portableCredentialFromStored({
      credential_document: built.document,
      proof,
      credential_hash: built.sha256Hash,
    });
    assert.equal(file.credentialHash, built.sha256Hash);
    assert.deepEqual(file.document, built.document);
    assert.equal(file.proof.proofValue, "abc");
    assert.equal(file.proof.cryptosuite, "eddsa-jcs-2022");
    assert.equal(JSON.stringify(file).includes("privateKey"), false);
    assert.equal(JSON.stringify(file).includes("BEGIN PRIVATE KEY"), false);
  });

  it("refuses a document that embeds a private key", () => {
    assert.throws(
      () => portableCredentialFromStored({
        credential_document: { ...built.document, privateKey: "secret" },
        proof: { ...proof, privateKey: undefined },
        credential_hash: built.sha256Hash,
      }),
      /Refusing to export/,
    );
  });

  it("does not invent a hash when the stored credential has none", () => {
    assert.throws(
      () => portableCredentialFromStored({
        credential_document: built.document,
        proof,
        credential_hash: null,
      }),
      /hash is unavailable/,
    );
  });
});
