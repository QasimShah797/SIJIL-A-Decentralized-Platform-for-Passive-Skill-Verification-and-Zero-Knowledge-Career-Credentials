import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RECRUITER_DIRECTORY_AUDIENCE, shareListedForRecruiters } from "./share-directory";

describe("recruiter directory visibility", () => {
  const now = new Date("2026-11-06T00:00:00.000Z");

  it("does not list a private share link", () => {
    assert.equal(shareListedForRecruiters({
      expiresAt: "2026-12-01T00:00:00.000Z",
      disclosedPayload: { competency: { name: "TypeScript" }, learner: { name: "A" } },
      now,
    }), false);
  });

  it("does not list an expired or revoked directory share", () => {
    assert.equal(shareListedForRecruiters({
      expiresAt: "2026-10-01T00:00:00.000Z",
      disclosedPayload: { audience: RECRUITER_DIRECTORY_AUDIENCE },
      now,
    }), false);
    assert.equal(shareListedForRecruiters({
      revokedAt: "2026-11-01T00:00:00.000Z",
      disclosedPayload: { audience: RECRUITER_DIRECTORY_AUDIENCE },
      now,
    }), false);
  });

  it("lists only an active share the learner marked for the directory", () => {
    assert.equal(shareListedForRecruiters({
      expiresAt: "2026-12-01T00:00:00.000Z",
      disclosedPayload: { audience: RECRUITER_DIRECTORY_AUDIENCE, competency: { name: "TypeScript" } },
      now,
    }), true);
  });
});

describe("private share migration", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "../supabase/migrations/20261106140000_private_share_reads.sql"),
    "utf8",
  );

  it("removes recruiter listing of shares, credentials, and every learner profile", () => {
    assert.match(sql, /DROP POLICY IF EXISTS "selective_disclosure_presentations_select_recruiter"/);
    assert.match(sql, /DROP POLICY IF EXISTS "credentials_select_recruiter"/);
    assert.match(sql, /DROP POLICY IF EXISTS "recruiter read learners"/);
    assert.equal(/CREATE POLICY "selective_disclosure_presentations_select_recruiter"/.test(sql), false);
    assert.equal(/CREATE POLICY "credentials_select_recruiter"/.test(sql), false);
    assert.match(sql, /learner_has_recruiter_directory_share/);
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /recruiter-directory/);
    assert.match(sql, /learner_contact/);
    assert.equal(/FROM public\.presentations/.test(sql), false);
  });
});
