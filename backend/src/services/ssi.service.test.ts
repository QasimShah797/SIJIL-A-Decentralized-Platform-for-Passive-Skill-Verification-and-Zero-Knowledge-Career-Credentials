import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { canonicalSsiBindingFromDid, encodeDidKeyFromRawPublicKey } from "../utils/did-key";
import { ssiBindSchema } from "../validators/ssi.validator";
import { SsiChallengeStore } from "./ssi-challenge.store";
import { SsiService } from "./ssi.service";

type Row = {
  user_id: string;
  did: string;
  fingerprint?: string;
  public_key_multibase?: string;
  bound_at?: string;
};

class MemorySsiDb {
  missing = false;
  rows: Row[] = [];

  from(_table: string) {
    const filters: Record<string, string> = {};
    const self = this;
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: string) {
        filters[column] = value;
        return builder;
      },
      async maybeSingle() {
        if (self.missing) {
          return { data: null, error: { code: "42P01", message: "could not find the table public.learner_ssi_identities" } };
        }
        const data = self.rows.find((row) =>
          Object.entries(filters).every(([column, value]) => (row as Record<string, string>)[column] === value),
        ) ?? null;
        return { data, error: null };
      },
      async insert(row: Row) {
        if (self.missing) {
          return { error: { code: "42P01", message: "could not find the table public.learner_ssi_identities" } };
        }
        if (self.rows.some((item) => item.user_id === row.user_id)) {
          return { error: { code: "23505", message: "duplicate key value violates unique constraint \"learner_ssi_identities_pkey\"" } };
        }
        if (self.rows.some((item) => item.did === row.did)) {
          return { error: { code: "23505", message: "duplicate key value violates unique constraint \"learner_ssi_identities_did_key\"" } };
        }
        self.rows.push(row);
        return { error: null };
      },
    };
    return builder;
  }
}

function learnerKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const raw = new Uint8Array(der.subarray(der.byteLength - 32));
  const did = encodeDidKeyFromRawPublicKey(raw);
  return { privateKey, did };
}

function signPayload(privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"], payload: string, did: string) {
  const message = Buffer.from(`${payload}\ndid=${did}`, "utf8");
  return sign(null, message, privateKey).toString("base64url");
}

describe("SSI ownership service", () => {
  it("verifies a fresh challenge and binds the DID to the authenticated user", async () => {
    const db = new MemorySsiDb();
    const store = new SsiChallengeStore(() => Date.now());
    const service = new SsiService(store, db as never);
    const userId = "11111111-1111-4111-8111-111111111111";
    const keys = learnerKeys();
    const challenge = service.issueChallenge(userId);
    const signature = signPayload(keys.privateKey, challenge.payload, keys.did);
    const bound = await service.bindIdentity(userId, {
      challengeId: challenge.challengeId,
      did: keys.did,
      signature,
    });
    assert.equal(bound.did, keys.did);
    assert.equal(bound.cryptographicallyBound, true);
    const identity = await service.getIdentity(userId);
    assert.equal(identity.did, keys.did);
    const derived = canonicalSsiBindingFromDid(keys.did);
    assert.equal(db.rows[0]?.did, derived.did);
    assert.equal(db.rows[0]?.public_key_multibase, derived.publicKeyMultibase);
    assert.equal(db.rows[0]?.fingerprint, derived.fingerprint);
    assert.equal(bound.fingerprint, derived.fingerprint);
  });

  it("ignores client-supplied public-key metadata and rejects extra bind fields", async () => {
    const parsed = ssiBindSchema.safeParse({
      challengeId: "11111111-1111-4111-8111-111111111111",
      did: learnerKeys().did,
      signature: "a".repeat(86),
      fingerprint: "00:00:00:00:00:00:00:00",
      public_key_multibase: "zTampered",
      privateKey: "leak",
    });
    assert.equal(parsed.success, false);
    const db = new MemorySsiDb();
    const service = new SsiService(new SsiChallengeStore(), db as never);
    const userId = "11111111-1111-4111-8111-111111111111";
    const keys = learnerKeys();
    const challenge = service.issueChallenge(userId);
    await service.bindIdentity(userId, {
      challengeId: challenge.challengeId,
      did: keys.did,
      signature: signPayload(keys.privateKey, challenge.payload, keys.did),
    });
    const derived = canonicalSsiBindingFromDid(keys.did);
    assert.notEqual(db.rows[0]?.fingerprint, "00:00:00:00:00:00:00:00");
    assert.equal(db.rows[0]?.fingerprint, derived.fingerprint);
    assert.equal(db.rows[0]?.public_key_multibase, derived.publicKeyMultibase);
  });

  it("rejects a placeholder DID instead of trusting the client string", async () => {
    const db = new MemorySsiDb();
    const service = new SsiService(new SsiChallengeStore(), db as never);
    const userId = "11111111-1111-4111-8111-111111111111";
    const challenge = service.issueChallenge(userId);
    await assert.rejects(
      () => service.bindIdentity(userId, {
        challengeId: challenge.challengeId,
        did: "did:key:z6Mk" + "a".repeat(40),
        signature: "a".repeat(86),
      }),
      /real Ed25519 did:key/,
    );
    assert.equal(db.rows.length, 0);
  });

  it("rejects an invalid signature", async () => {
    const db = new MemorySsiDb();
    const service = new SsiService(new SsiChallengeStore(), db as never);
    const userId = "11111111-1111-4111-8111-111111111111";
    const keys = learnerKeys();
    const challenge = service.issueChallenge(userId);
    await assert.rejects(
      () => service.bindIdentity(userId, {
        challengeId: challenge.challengeId,
        did: keys.did,
        signature: "a".repeat(86),
      }),
      /Signature does not prove ownership/,
    );
  });

  it("rejects challenge replay and expiry", async () => {
    let now = 1_000_000;
    const store = new SsiChallengeStore(() => now);
    const db = new MemorySsiDb();
    const service = new SsiService(store, db as never);
    const userId = "11111111-1111-4111-8111-111111111111";
    const keys = learnerKeys();
    const challenge = service.issueChallenge(userId);
    const signature = signPayload(keys.privateKey, challenge.payload, keys.did);
    await service.bindIdentity(userId, { challengeId: challenge.challengeId, did: keys.did, signature });
    await assert.rejects(
      () => service.bindIdentity(userId, { challengeId: challenge.challengeId, did: keys.did, signature }),
      /already been used/,
    );

    const expired = service.issueChallenge(userId);
    now += 6 * 60 * 1000;
    const expiredSig = signPayload(keys.privateKey, expired.payload, keys.did);
    await assert.rejects(
      () => service.bindIdentity(userId, { challengeId: expired.challengeId, did: keys.did, signature: expiredSig }),
      /expired/,
    );
  });

  it("rejects binding a challenge issued to another account", async () => {
    const service = new SsiService(new SsiChallengeStore(), new MemorySsiDb() as never);
    const alice = "11111111-1111-4111-8111-111111111111";
    const bob = "22222222-2222-4222-8222-222222222222";
    const keys = learnerKeys();
    const challenge = service.issueChallenge(alice);
    const signature = signPayload(keys.privateKey, challenge.payload, keys.did);
    await assert.rejects(
      () => service.bindIdentity(bob, { challengeId: challenge.challengeId, did: keys.did, signature }),
      /different account/,
    );
  });

  it("does not treat a DID string as proof of ownership", async () => {
    const db = new MemorySsiDb();
    const service = new SsiService(new SsiChallengeStore(), db as never);
    const userId = "11111111-1111-4111-8111-111111111111";
    const keys = learnerKeys();
    const challenge = service.issueChallenge(userId);
    await assert.rejects(
      () => service.bindIdentity(userId, {
        challengeId: challenge.challengeId,
        did: keys.did,
        signature: signPayload(learnerKeys().privateKey, challenge.payload, keys.did),
      }),
      /Signature does not prove ownership/,
    );
  });

  it("does not consume a challenge when the signature is invalid", async () => {
    const db = new MemorySsiDb();
    const service = new SsiService(new SsiChallengeStore(), db as never);
    const userId = "11111111-1111-4111-8111-111111111111";
    const keys = learnerKeys();
    const challenge = service.issueChallenge(userId);
    await assert.rejects(
      () => service.bindIdentity(userId, {
        challengeId: challenge.challengeId,
        did: keys.did,
        signature: "a".repeat(86),
      }),
      /Signature does not prove ownership/,
    );
    const signature = signPayload(keys.privateKey, challenge.payload, keys.did);
    const bound = await service.bindIdentity(userId, {
      challengeId: challenge.challengeId,
      did: keys.did,
      signature,
    });
    assert.equal(bound.did, keys.did);
  });

  it("refuses to replace an existing DID or reassign a DID to another account", async () => {
    const db = new MemorySsiDb();
    const service = new SsiService(new SsiChallengeStore(), db as never);
    const alice = "11111111-1111-4111-8111-111111111111";
    const bob = "22222222-2222-4222-8222-222222222222";
    const aliceKeys = learnerKeys();
    const otherKeys = learnerKeys();
    const first = service.issueChallenge(alice);
    await service.bindIdentity(alice, {
      challengeId: first.challengeId,
      did: aliceKeys.did,
      signature: signPayload(aliceKeys.privateKey, first.payload, aliceKeys.did),
    });
    const frozen = { ...db.rows[0] };
    const retry = service.issueChallenge(alice);
    await assert.rejects(
      () => service.bindIdentity(alice, {
        challengeId: retry.challengeId,
        did: otherKeys.did,
        signature: signPayload(otherKeys.privateKey, retry.payload, otherKeys.did),
      }),
      /already has a registered DID/,
    );
    assert.equal(db.rows.length, 1);
    assert.deepEqual(db.rows[0], frozen);
    assert.equal(db.rows[0]?.fingerprint, canonicalSsiBindingFromDid(aliceKeys.did).fingerprint);
    assert.equal(db.rows[0]?.public_key_multibase, canonicalSsiBindingFromDid(aliceKeys.did).publicKeyMultibase);
    const bobChallenge = service.issueChallenge(bob);
    await assert.rejects(
      () => service.bindIdentity(bob, {
        challengeId: bobChallenge.challengeId,
        did: aliceKeys.did,
        signature: signPayload(aliceKeys.privateKey, bobChallenge.payload, aliceKeys.did),
      }),
      /already bound to another account/,
    );
  });

  it("maps a unique-constraint race to 409 instead of replacing the DID", async () => {
    const db = new MemorySsiDb();
    const service = new SsiService(new SsiChallengeStore(), db as never);
    const userId = "11111111-1111-4111-8111-111111111111";
    const firstKeys = learnerKeys();
    const secondKeys = learnerKeys();
    db.rows.push({ user_id: userId, did: firstKeys.did, fingerprint: "aa:bb" });
    const challenge = service.issueChallenge(userId);
    await assert.rejects(
      () => service.bindIdentity(userId, {
        challengeId: challenge.challengeId,
        did: secondKeys.did,
        signature: signPayload(secondKeys.privateKey, challenge.payload, secondKeys.did),
      }),
      /already has a registered DID/,
    );
    assert.equal(db.rows.length, 1);
    assert.equal(db.rows[0]?.did, firstKeys.did);
  });

  it("requires a proven SSI DID owned by the authenticated user", async () => {
    const db = new MemorySsiDb();
    const service = new SsiService(new SsiChallengeStore(), db as never);
    const userId = "11111111-1111-4111-8111-111111111111";
    await assert.rejects(() => service.requireProvenHolderDid(userId), /Activate a learner SSI identity/);
    const keys = learnerKeys();
    const challenge = service.issueChallenge(userId);
    await service.bindIdentity(userId, {
      challengeId: challenge.challengeId,
      did: keys.did,
      signature: signPayload(keys.privateKey, challenge.payload, keys.did),
    });
    const did = await service.requireProvenHolderDid(userId);
    assert.equal(did, keys.did);
    await assert.rejects(
      () => service.requireProvenHolderDid("22222222-2222-4222-8222-222222222222"),
      /Activate a learner SSI identity/,
    );
  });

  it("refuses issuance lookup when the SSI table is missing", async () => {
    const db = new MemorySsiDb();
    db.missing = true;
    const service = new SsiService(new SsiChallengeStore(), db as never);
    await assert.rejects(
      () => service.requireProvenHolderDid("11111111-1111-4111-8111-111111111111"),
      /Apply supabase\/migrations/,
    );
  });

  it("returns tableReady=false when the migration is absent and 503 on bind", async () => {
    const db = new MemorySsiDb();
    db.missing = true;
    const service = new SsiService(new SsiChallengeStore(), db as never);
    const identity = await service.getIdentity("11111111-1111-4111-8111-111111111111");
    assert.equal(identity.tableReady, false);
    const keys = learnerKeys();
    const challenge = service.issueChallenge("11111111-1111-4111-8111-111111111111");
    const signature = signPayload(keys.privateKey, challenge.payload, keys.did);
    await assert.rejects(
      () => service.bindIdentity("11111111-1111-4111-8111-111111111111", {
        challengeId: challenge.challengeId,
        did: keys.did,
        signature,
      }),
      /Apply supabase\/migrations/,
    );
  });
});
