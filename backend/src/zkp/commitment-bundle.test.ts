/**
 * The Edge Function and backend ship copies of the circuit commitment helper.
 * They must stay byte-for-byte identical so the Poseidon inputs cannot drift.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const copies = [
  path.resolve(__dirname, "commitment.mjs"),
  path.resolve(__dirname, "../../../supabase/functions/_shared/commitment.mjs"),
  path.resolve(__dirname, "../../../circuits/score-threshold-v1/src/commitment.mjs"),
];

describe("packaged Poseidon commitment", () => {
  it("matches the circuit helper in the edge function and the backend", () => {
    const digests = copies.map((file) => createHash("sha256").update(readFileSync(file)).digest("hex"));
    assert.equal(new Set(digests).size, 1);
  });
});
