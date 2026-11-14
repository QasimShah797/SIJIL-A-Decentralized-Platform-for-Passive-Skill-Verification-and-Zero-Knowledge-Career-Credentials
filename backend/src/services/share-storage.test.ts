import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SHARE_CREATE_UNAVAILABLE, SHARE_HISTORY_UNAVAILABLE, shareStorageFailure } from "./share-storage";

describe("share storage errors", () => {
  it("hides database failures behind a retryable learner message", () => {
    const listed = shareStorageFailure("list");
    const created = shareStorageFailure("create");
    assert.equal(listed.message, SHARE_HISTORY_UNAVAILABLE);
    assert.equal(listed.statusCode, 503);
    assert.equal(created.message, SHARE_CREATE_UNAVAILABLE);
    assert.equal(created.statusCode, 503);
    const leaked = "relation selective_disclosure_presentations does not exist";
    assert.equal(listed.message.includes(leaked), false);
    assert.equal(created.message.includes("schema cache"), false);
  });
});

describe("legacy presentation access", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "../supabase/migrations/20261106023000_presentations_token_lookup.sql"),
    "utf8",
  );

  it("removes blanket recruiter listing and requires an exact token", () => {
    assert.match(sql, /DROP POLICY IF EXISTS "presentations_select_recruiter"/);
    assert.match(sql, /WHERE p\.token = p_token/);
    assert.match(sql, /LIMIT 1/);
    assert.equal(/CREATE POLICY "presentations_select_recruiter"/.test(sql), false);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.presentation_by_token\(text\) TO authenticated/);
    assert.match(sql, /to_regclass\('public\.presentations'\) IS NULL/);
  });
});
