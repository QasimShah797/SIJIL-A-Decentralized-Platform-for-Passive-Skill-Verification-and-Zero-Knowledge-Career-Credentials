import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../utils/AppError";
import {
  applyAnchorResult,
  createPendingVersion,
  recruiterMaySeeVersion,
  requestSignedVersion,
  SIGNED_VERSION_UNAVAILABLE,
  type CompetencyVersion,
} from "./competency-version";

const NOW = "2026-11-17T12:00:00.000Z";
const OLD_CREDENTIAL = "123e4567-e89b-42d3-a456-426614174000";

function pending(summary = "Completed a new API project."): CompetencyVersion {
  return createPendingVersion({
    learnerUserId: "learner-1",
    skillName: "TypeScript",
    evidenceSource: "github",
    evidenceReference: "repo:learner/typescript",
    evidenceSummary: summary,
    existing: [],
    now: NOW,
  });
}

describe("secure competency versions", () => {
  it("does not issue a credential when evidence arrives", () => {
    const row = pending();
    assert.equal(row.status, "pending_evidence");
    assert.equal(row.credentialId, null);
    assert.equal(row.validationReference, null);
    assert.equal(row.versionNumber, 1);
  });

  it("rejects a learner attempt to validate or reuse an old credential", () => {
    const row = pending();
    assert.throws(() => requestSignedVersion({ actor: "learner", version: row, existing: [], credentialId: OLD_CREDENTIAL }), (err: unknown) => err instanceof AppError && err.statusCode === 403);
  });

  it("rejects an issuer attempt to reuse an old credential and does not sign a new one", () => {
    const first = { ...pending(), status: "issued" as const, credentialId: OLD_CREDENTIAL, validationReference: "gate-1" };
    const second = createPendingVersion({
      learnerUserId: "learner-1",
      skillName: "TypeScript",
      evidenceSource: "practical",
      evidenceReference: "attempt:223e4567-e89b-42d3-a456-426614174000",
      evidenceSummary: "A later assessment was completed.",
      existing: [first],
      now: NOW,
    });
    assert.equal(first.status, "issued");
    assert.equal(second.versionNumber, 2);
    assert.equal(second.previousVersionId, first.id);
    assert.throws(
      () => requestSignedVersion({ actor: "issuer", version: second, existing: [first], credentialId: OLD_CREDENTIAL }),
      (err: unknown) => err instanceof AppError && err.statusCode === 409 && err.message.includes("cannot be reused"),
    );
    assert.throws(
      () => requestSignedVersion({ actor: "issuer", version: second, existing: [first] }),
      (err: unknown) => err instanceof AppError && err.statusCode === 409 && err.message === SIGNED_VERSION_UNAVAILABLE,
    );
  });

  it("rejects duplicate evidence and a repeated version number", () => {
    const row = pending();
    assert.throws(() => createPendingVersion({
      learnerUserId: "learner-1",
      skillName: "TypeScript",
      evidenceSource: "github",
      evidenceReference: "repo:learner/typescript",
      evidenceSummary: "Completed a new API project.",
      existing: [row],
      now: NOW,
    }), /already recorded/);
    assert.throws(() => createPendingVersion({
      learnerUserId: "learner-1",
      skillName: "TypeScript",
      evidenceSource: "moodle",
      evidenceReference: "course:moodle-1",
      evidenceSummary: "Finished the related course.",
      existing: [{ ...row, versionNumber: 1 }],
      now: NOW,
    }), /already open/);
    assert.throws(() => createPendingVersion({
      learnerUserId: "learner-1",
      skillName: "TypeScript",
      evidenceSource: "github",
      evidenceReference: "repo:learner/typescript",
      evidenceSummary: "A different note about the same record.",
      existing: [{ ...row, status: "issued", credentialId: OLD_CREDENTIAL, validationReference: "gate-1" }],
      now: NOW,
    }), /already recorded/);
  });

  it("does not confirm an unavailable or failed anchor", () => {
    const issued: CompetencyVersion = {
      ...pending(),
      status: "issued",
      credentialId: "223e4567-e89b-42d3-a456-426614174000",
      validationReference: "new-signature",
    };
    assert.equal(applyAnchorResult(issued, { available: false }).anchorStatus, "unavailable");
    assert.equal(applyAnchorResult(issued, { available: true, failed: true }).anchorTxId, null);
    assert.equal(applyAnchorResult(issued, { available: true, txId: "tx-real" }).anchorStatus, "confirmed");
    assert.throws(() => applyAnchorResult(pending(), { available: true, txId: "tx-real" }), /newly signed/);
  });

  it("hides a later version that was not put in the share", () => {
    const first = pending();
    const second = createPendingVersion({
      learnerUserId: "learner-1",
      skillName: "TypeScript",
      evidenceSource: "practical",
      evidenceReference: "attempt:223e4567-e89b-42d3-a456-426614174000",
      evidenceSummary: "A later assessment was completed.",
      existing: [{ ...first, status: "issued", credentialId: OLD_CREDENTIAL, validationReference: "gate-1" }],
      now: NOW,
    });
    const share = { competency: { name: "TypeScript" }, versionId: first.id };
    assert.equal(recruiterMaySeeVersion(first, [share]), true);
    assert.equal(recruiterMaySeeVersion(second, [share]), false);
  });
});
