import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ALL_RECRUITERS_SHARE, DIRECT_RECRUITER_SHARE, RECRUITER_DIRECTORY_AUDIENCE, shareListedForRecruiters, shareVisibleToRecruiter } from "./share-directory";

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

  it("shows a direct share only to the selected recruiter", () => {
    const payload = {
      shareKind: DIRECT_RECRUITER_SHARE,
      recipientUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      competency: { name: "TypeScript" },
    };
    assert.equal(shareVisibleToRecruiter({
      expiresAt: "2026-12-01T00:00:00.000Z",
      disclosedPayload: payload,
      recruiterUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      now,
    }), true);
    assert.equal(shareVisibleToRecruiter({
      expiresAt: "2026-12-01T00:00:00.000Z",
      disclosedPayload: payload,
      recruiterUserId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      now,
    }), false);
    assert.equal(shareListedForRecruiters({
      expiresAt: "2026-12-01T00:00:00.000Z",
      disclosedPayload: payload,
      now,
    }), false);
  });

  it("does not turn a public link into a dashboard candidate", () => {
    assert.equal(shareVisibleToRecruiter({
      expiresAt: "2026-12-01T00:00:00.000Z",
      disclosedPayload: { audience: "sijil-recruiter-verify", competency: { name: "TypeScript" } },
      recruiterUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
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

  it("shows an all-recruiter share to every recruiter, including one who joins later", () => {
    const payload = {
      shareKind: ALL_RECRUITERS_SHARE,
      consentedAt: "2026-11-06T00:00:00.000Z",
      competency: { name: "TypeScript" },
    };
    const recruiterA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const recruiterB = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    assert.equal(shareVisibleToRecruiter({
      expiresAt: "2026-12-01T00:00:00.000Z",
      disclosedPayload: payload,
      recruiterUserId: recruiterA,
      now,
    }), true);
    assert.equal(shareVisibleToRecruiter({
      expiresAt: "2026-12-01T00:00:00.000Z",
      disclosedPayload: payload,
      recruiterUserId: recruiterB,
      now,
    }), true);
    assert.equal(shareListedForRecruiters({
      expiresAt: "2026-12-01T00:00:00.000Z",
      disclosedPayload: payload,
      now,
    }), false);
    assert.equal(shareVisibleToRecruiter({
      revokedAt: "2026-11-01T00:00:00.000Z",
      disclosedPayload: payload,
      recruiterUserId: recruiterA,
      now,
    }), false);
    assert.equal(shareVisibleToRecruiter({
      expiresAt: "2026-10-01T00:00:00.000Z",
      disclosedPayload: payload,
      recruiterUserId: recruiterB,
      now,
    }), false);
  });

  it("stops a revoked or expired direct share", () => {
    const payload = {
      shareKind: DIRECT_RECRUITER_SHARE,
      recipientUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    };
    assert.equal(shareVisibleToRecruiter({
      revokedAt: "2026-11-01T00:00:00.000Z",
      disclosedPayload: payload,
      recruiterUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      now,
    }), false);
    assert.equal(shareVisibleToRecruiter({
      expiresAt: "2026-10-01T00:00:00.000Z",
      disclosedPayload: payload,
      recruiterUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      now,
    }), false);
  });
});

describe("all recruiter migration", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "../supabase/migrations/20261115200000_all_recruiter_share_reads.sql"),
    "utf8",
  );

  it("lets recruiter accounts read only an active all-recruiter share", () => {
    assert.match(sql, /all-recruiters/);
    assert.match(sql, /has_role\(auth\.uid\(\), 'recruiter'\)/);
    assert.match(sql, /FOR SELECT/);
    assert.equal(/FOR UPDATE|FOR INSERT|FOR ALL/.test(sql), false);
    assert.equal(/learner_profiles/.test(sql), false);
    assert.equal(/public-link/.test(sql), false);
  });
});

describe("direct recipient migration", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "../supabase/migrations/20261115193000_direct_recruiter_share_reads.sql"),
    "utf8",
  );

  it("lets only the named recipient read an active direct share", () => {
    assert.match(sql, /recipientUserId/);
    assert.match(sql, /direct-recruiter/);
    assert.match(sql, /auth\.uid\(\)::text/);
    assert.equal(/CREATE POLICY "selective_disclosure_presentations_select_recruiter"/.test(sql), false);
    assert.equal(/learner_profiles/.test(sql), false);
    assert.equal(/FOR UPDATE|FOR INSERT|FOR ALL/.test(sql), false);
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
