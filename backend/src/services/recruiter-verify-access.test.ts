import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertRecruiterCredentialAccess,
  classifyRecruiterCredentialAccess,
  sharePayloadMentionsCredential,
} from "./recruiter-verify";
import { AppError } from "../utils/AppError";

const RECRUITER = "11111111-1111-4111-8111-111111111111";
const CREDENTIAL = "22222222-2222-4222-8222-222222222222";

describe("recruiter verify selective disclosure access", () => {
  it("matches when the payload includes the credential id", () => {
    assert.equal(
      sharePayloadMentionsCredential({ competencyVersionIds: [CREDENTIAL] }, CREDENTIAL, "React"),
      true,
    );
  });

  it("matches when the shared competency name aligns with the credential skill", () => {
    assert.equal(
      sharePayloadMentionsCredential(
        { competency: { name: "React Development" } },
        CREDENTIAL,
        "React Development",
      ),
      true,
    );
  });

  it("allows only active recruiter-visible shares", () => {
    const access = classifyRecruiterCredentialAccess({
      recruiterUserId: RECRUITER,
      credentialId: CREDENTIAL,
      skillName: "React",
      shares: [{
        disclosedPayload: {
          shareKind: "all-recruiters",
          competency: { name: "React" },
        },
        expiresAt: null,
        revokedAt: null,
      }],
    });
    assert.equal(access, "allowed");
  });

  it("reports expired when the only related share is past expiry", () => {
    const access = classifyRecruiterCredentialAccess({
      recruiterUserId: RECRUITER,
      credentialId: CREDENTIAL,
      skillName: "React",
      now: new Date("2026-11-23T12:00:00.000Z"),
      shares: [{
        disclosedPayload: {
          shareKind: "all-recruiters",
          competency: { name: "React" },
        },
        expiresAt: "2026-11-01T00:00:00.000Z",
        revokedAt: null,
      }],
    });
    assert.equal(access, "expired");
  });

  it("reports revoked when the related share was revoked", () => {
    const access = classifyRecruiterCredentialAccess({
      recruiterUserId: RECRUITER,
      credentialId: CREDENTIAL,
      skillName: "React",
      shares: [{
        disclosedPayload: {
          shareKind: "all-recruiters",
          competency: { name: "React" },
        },
        expiresAt: null,
        revokedAt: "2026-11-20T00:00:00.000Z",
      }],
    });
    assert.equal(access, "revoked");
  });

  it("forbids unrelated credentials", () => {
    const access = classifyRecruiterCredentialAccess({
      recruiterUserId: RECRUITER,
      credentialId: CREDENTIAL,
      skillName: "Rust",
      shares: [{
        disclosedPayload: {
          shareKind: "all-recruiters",
          competency: { name: "React" },
        },
        expiresAt: null,
        revokedAt: null,
      }],
    });
    assert.equal(access, "forbidden");
  });

  it("does not substitute a different credential for one pinned in a share", () => {
    const pinned = "33333333-3333-4333-8333-333333333333";
    const shares = [{ competencyId: "skill-1", disclosedPayload: {
      shareKind: "all-recruiters", sharedCredentialId: pinned, competency: { name: "React" },
    } }];
    const input = { recruiterUserId: RECRUITER, skillName: "React", competencyId: "skill-1", shares };
    assert.equal(classifyRecruiterCredentialAccess({ ...input, credentialId: CREDENTIAL }), "forbidden");
    assert.equal(classifyRecruiterCredentialAccess({ ...input, credentialId: pinned }), "allowed");
  });

  it("throws 410 for expired access", () => {
    assert.throws(
      () => assertRecruiterCredentialAccess("expired"),
      (err: unknown) => err instanceof AppError && err.statusCode === 410,
    );
  });

  it("throws 403 for forbidden access", () => {
    assert.throws(
      () => assertRecruiterCredentialAccess("forbidden"),
      (err: unknown) => err instanceof AppError && err.statusCode === 403,
    );
  });
});
