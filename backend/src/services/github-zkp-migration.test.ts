import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const sql = readFileSync(
  path.resolve(__dirname, "../../../supabase/migrations/20261031010000_github_contribution_zkp_snapshots.sql"),
  "utf8",
);

describe("GitHub ZKP migration constraints", () => {
  it("keeps writes on service-role RPCs and enables row level security", () => {
    for (const table of [
      "github_contribution_snapshots",
      "github_contribution_openings",
      "github_contribution_proofs",
      "github_contribution_disclosures",
    ]) {
      assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
      assert.match(sql, new RegExp(`REVOKE ALL ON public\\.${table}`));
    }
    assert.equal(/GRANT INSERT/i.test(sql), false);
    assert.equal(/GRANT UPDATE/i.test(sql), false);
    assert.equal(/GRANT DELETE/i.test(sql), false);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.create_github_contribution_snapshot/);
    assert.match(sql, /TO service_role/);
    assert.match(sql, /FROM PUBLIC, anon, authenticated/);
  });

  it("checks BN254 bounds, ownership, and immutability", () => {
    assert.match(sql, /is_canonical_bn254_decimal/);
    assert.match(sql, /21888242871839275222246405745257275088548364400416034343698204186575808495617/);
    assert.match(sql, /FOREIGN KEY \(snapshot_id, learner_user_id\)/);
    assert.match(sql, /FOREIGN KEY \(proof_id, learner_user_id\)/);
    assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.github_contribution_openings/);
    assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.github_contribution_proofs/);
    assert.match(sql, /contribution_count BETWEEN 0 AND 4294967295/);
    assert.match(sql, /UNIQUE \(snapshot_id, threshold\)/);
    assert.equal(/GRANT SELECT ON public\.github_contribution_openings TO anon/.test(sql), false);
    assert.equal(/GRANT SELECT ON public\.github_contribution_openings TO authenticated/.test(sql), false);
    assert.equal(/GRANT INSERT ON public\.github_contribution_snapshots TO authenticated/.test(sql), false);
    assert.equal(/GRANT INSERT ON public\.github_contribution_openings TO authenticated/.test(sql), false);
    assert.match(sql, /CREATE POLICY github_contribution_openings_deny_client[\s\S]*USING \(false\)/);
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /is_canonical_bn254_decimal/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.create_github_contribution_proof/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.create_github_contribution_disclosure/);
  });
});
