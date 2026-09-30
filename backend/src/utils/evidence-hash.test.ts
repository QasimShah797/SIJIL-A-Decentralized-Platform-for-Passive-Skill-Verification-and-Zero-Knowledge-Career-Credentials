import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeLiveEvidenceIntegrity,
  evidenceFileTooLarge,
  evidenceHashesMatch,
  hashEvidenceBytes,
  hashEvidenceMetadata,
  hashEvidenceRecord,
  MAX_EVIDENCE_FILE_BYTES,
  resolveLiveEvidenceHash,
  skillEvidenceStoragePath,
  sortedEvidenceHashes,
} from "./evidence-hash";
import { buildCredentialDocument } from "../services/credential-document.service";

describe("evidence content hashes", () => {
  it("hashes file bytes with SHA-256", () => {
    const hash = hashEvidenceBytes(Buffer.from("certificate.pdf"));
    assert.equal(hash.length, 64);
    assert.notEqual(hash, hashEvidenceBytes(Buffer.from("tampered.pdf")));
  });

  it("hashes canonical metadata for GitHub/link records", () => {
    const meta = {
      source: "GitHub",
      title: "sijil",
      url: "https://github.com/org/sijil",
      repositoryName: "sijil",
      repositoryUrl: "https://github.com/org/sijil",
    };
    const hash = hashEvidenceMetadata(meta);
    assert.equal(hash, hashEvidenceRecord(meta));
    assert.notEqual(hash, hashEvidenceMetadata({ ...meta, url: "https://github.com/org/other" }));
  });

  it("sorts hashes deterministically for the credential document", () => {
    assert.deepEqual(sortedEvidenceHashes(["c", "a", "b"]), ["a", "b", "c"]);
  });

  it("detects when a stored hash no longer matches current metadata", () => {
    const original = hashEvidenceMetadata({
      source: "Upload",
      title: "Transcript",
      url: "https://storage.example/a.pdf",
    });
    const live = resolveLiveEvidenceHash({
      content_hash: original,
      source: "Upload",
      title: "Transcript",
      url: "https://storage.example/tampered.pdf",
    });
    assert.equal(live.matchesStored, false);
    assert.equal(evidenceHashesMatch([original], [live.hash]), false);
  });

  it("extracts the skill-evidence storage path from a public URL", () => {
    const path = skillEvidenceStoragePath(
      "https://example.supabase.co/storage/v1/object/public/skill-evidence/user-1/skill-1/file.pdf",
    );
    assert.equal(path, "user-1/skill-1/file.pdf");
  });

  it("recomputes SHA-256 from downloaded bytes and fails when the file was modified", async () => {
    const originalBytes = Buffer.from("certificate.pdf");
    const originalHash = hashEvidenceBytes(originalBytes);
    const document = buildCredentialDocument({
      credentialUri: "urn:uuid:sijil:file-cred",
      issuerDid: "did:web:issuer.cust.edu.pk",
      holderDid: "did:key:z6Mk",
      skill: "TypeScript",
      evidenceCount: 1,
      evidenceHashes: [originalHash],
      validFrom: "2026-01-15T00:00:00.000Z",
    }).document;

    const tampered = await computeLiveEvidenceIntegrity(
      [{
        content_hash: originalHash,
        source: "Upload",
        title: "certificate.pdf",
        url: "https://example.supabase.co/storage/v1/object/public/skill-evidence/u/s/certificate.pdf",
      }],
      document,
      async () => Buffer.from("tampered.pdf"),
    );
    assert.equal(tampered.mismatch, true);
    assert.equal(tampered.unavailable, false);

    const unavailable = await computeLiveEvidenceIntegrity(
      [{
        content_hash: originalHash,
        source: "Upload",
        title: "certificate.pdf",
        url: "https://example.supabase.co/storage/v1/object/public/skill-evidence/u/s/certificate.pdf",
      }],
      document,
      async () => "unavailable",
    );
    assert.equal(unavailable.unavailable, true);
    assert.equal(unavailable.mismatch, false);

    const oversized = await computeLiveEvidenceIntegrity(
      [{
        content_hash: originalHash,
        source: "Upload",
        title: "certificate.pdf",
        url: "https://example.supabase.co/storage/v1/object/public/skill-evidence/u/s/certificate.pdf",
      }],
      document,
      async () => Buffer.alloc(MAX_EVIDENCE_FILE_BYTES + 1),
    );
    assert.equal(oversized.unavailable, true);
    assert.equal(oversized.mismatch, false);
    assert.equal(evidenceFileTooLarge(Buffer.alloc(MAX_EVIDENCE_FILE_BYTES + 1)), true);
    assert.equal(evidenceFileTooLarge(Buffer.alloc(1)), false);
  });

  it("marks credentials without evidence hashes as legacy rather than tampered", async () => {
    const document = buildCredentialDocument({
      credentialUri: "urn:uuid:sijil:legacy",
      issuerDid: "did:web:issuer.cust.edu.pk",
      holderDid: "did:key:z6Mk",
      skill: "TypeScript",
      evidenceCount: 0,
      validFrom: "2026-01-15T00:00:00.000Z",
    }).document;
    const withoutHashes = {
      ...document,
      credentialSubject: {
        id: document.credentialSubject.id,
        skill: document.credentialSubject.skill,
        evidenceCount: 0,
      },
    };
    const outcome = await computeLiveEvidenceIntegrity([], withoutHashes, async () => null);
    assert.equal(outcome.legacy, true);
    assert.equal(outcome.mismatch, false);
  });
});
