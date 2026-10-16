import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { canonicalSsiBindingFromDid, encodeDidKeyFromRawPublicKey } from "./did-key";

const migrationPath = resolve(
  process.cwd(),
  "../supabase/migrations/20261016120000_learner_ssi_identities.sql",
);

type IdentityRow = {
  user_id: string;
  did: string;
  fingerprint: string;
  public_key_multibase: string;
};

/** Mirrors public.prevent_ssi_identity_reassignment() */
function preventSsiIdentityReassignment(oldRow: IdentityRow, newRow: IdentityRow): IdentityRow {
  if (newRow.user_id !== oldRow.user_id) {
    throw new Error("SSI identity user_id cannot be changed");
  }
  if (newRow.did !== oldRow.did) {
    throw new Error("SSI DID cannot be reassigned");
  }
  if (newRow.fingerprint !== oldRow.fingerprint) {
    throw new Error("SSI fingerprint cannot be changed");
  }
  if (newRow.public_key_multibase !== oldRow.public_key_multibase) {
    throw new Error("SSI public_key_multibase cannot be changed");
  }
  return newRow;
}

function sampleBinding() {
  const { publicKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const raw = new Uint8Array(der.subarray(der.byteLength - 32));
  return canonicalSsiBindingFromDid(encodeDidKeyFromRawPublicKey(raw));
}

describe("SSI identity migration contract", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("creates only learner_ssi_identities and does not modify credentials", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.learner_ssi_identities/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.credentials/i);
    assert.doesNotMatch(sql, /UPDATE\s+public\.credentials/i);
    assert.doesNotMatch(sql, /ALTER TABLE public\.learner_profiles/i);
    assert.doesNotMatch(sql, /UPDATE\s+public\.learner_profiles/i);
    assert.match(sql, /FORCE ROW LEVEL SECURITY/);
    assert.match(sql, /GRANT ALL ON TABLE public\.learner_ssi_identities TO service_role/);
    assert.match(sql, /REVOKE ALL ON TABLE public\.learner_ssi_identities FROM PUBLIC, anon, authenticated/);
    assert.match(sql, /GRANT SELECT ON TABLE public\.learner_ssi_identities TO authenticated/);
    assert.match(sql, /public_key_multibase = substr\(did, 9\)/);
    assert.match(sql, /NEW\.fingerprint IS DISTINCT FROM OLD\.fingerprint/);
    assert.match(sql, /NEW\.public_key_multibase IS DISTINCT FROM OLD\.public_key_multibase/);
    assert.match(sql, /NEW\.did IS DISTINCT FROM OLD\.did/);
  });

  it("aligns SQL substr(did, 9) with the canonical multibase derived from the public key", () => {
    const binding = sampleBinding();
    assert.equal(binding.did.slice(8), binding.publicKeyMultibase);
    assert.equal(binding.did.slice("did:key:".length), binding.publicKeyMultibase);
  });

  it("freezes fingerprint and public_key_multibase after binding", () => {
    const binding = sampleBinding();
    const bound: IdentityRow = {
      user_id: "11111111-1111-4111-8111-111111111111",
      did: binding.did,
      fingerprint: binding.fingerprint,
      public_key_multibase: binding.publicKeyMultibase,
    };
    assert.equal(preventSsiIdentityReassignment(bound, { ...bound }).did, bound.did);
    assert.throws(
      () => preventSsiIdentityReassignment(bound, { ...bound, fingerprint: "00:00:00:00:00:00:00:00" }),
      /fingerprint cannot be changed/,
    );
    assert.throws(
      () => preventSsiIdentityReassignment(bound, { ...bound, public_key_multibase: "zTampered" }),
      /public_key_multibase cannot be changed/,
    );
    assert.throws(
      () => preventSsiIdentityReassignment(bound, { ...bound, did: sampleBinding().did }),
      /DID cannot be reassigned/,
    );
    assert.throws(
      () => preventSsiIdentityReassignment(bound, {
        ...bound,
        user_id: "22222222-2222-4222-8222-222222222222",
      }),
      /user_id cannot be changed/,
    );
  });
});
