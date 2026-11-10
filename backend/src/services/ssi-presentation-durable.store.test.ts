import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { encodeDidKeyFromRawPublicKey } from "../utils/did-key";
import { SSI_PRESENT_PROTOCOL } from "./ssi-presentation-protocol";
import {
  DurableSsiPresentationChallengeStore,
  type PresentationChallengeDb,
} from "./ssi-presentation-durable.store";

type Row = {
  id: string;
  learner_user_id: string;
  holder_did: string;
  audience: string;
  nonce: string;
  credential_ids: string[];
  credential_hashes: string[];
  claims: Record<string, unknown>;
  issued_at: string;
  expires_at: string;
  used_at: string | null;
};

const MISSING = { code: "42P01", message: "could not find the table public.ssi_presentation_challenges" };
const DOWN = { code: "08006", message: "connection refused" };
const LEARNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

class FakePresentationDb {
  rows: Row[] = [];
  missing = false;
  down = false;
  failInsert = false;

  from(_table: string) {
    const self = this;
    return {
      async insert(row: Record<string, unknown>) {
        if (self.missing) return { error: MISSING };
        if (self.down || self.failInsert) return { error: DOWN };
        self.rows.push({
          id: String(row.id),
          learner_user_id: String(row.learner_user_id),
          holder_did: String(row.holder_did),
          audience: String(row.audience),
          nonce: String(row.nonce),
          credential_ids: row.credential_ids as string[],
          credential_hashes: row.credential_hashes as string[],
          claims: row.claims as Record<string, unknown>,
          issued_at: String(row.issued_at),
          expires_at: String(row.expires_at),
          used_at: null,
        });
        return { error: null };
      },
      select() {
        return {
          eq(column: string, value: string) {
            return {
              async maybeSingle() {
                if (self.missing) return { data: null, error: MISSING };
                if (self.down) return { data: null, error: DOWN };
                const data = self.rows.find((row) => (row as Record<string, unknown>)[column] === value) ?? null;
                return { data, error: null };
              },
            };
          },
          async limit() {
            if (self.missing) return { error: MISSING };
            if (self.down) return { error: DOWN };
            return { error: null };
          },
        };
      },
      update(patch: Record<string, unknown>) {
        return {
          eq(firstColumn: string, firstValue: string) {
            return {
              eq(secondColumn: string, secondValue: string) {
                return {
                  is() {
                    return {
                      gt(_column: string, nowIso: string) {
                        return {
                          select() {
                            return {
                              async maybeSingle() {
                                if (self.missing) return { data: null, error: MISSING };
                                if (self.down) return { data: null, error: DOWN };
                                const index = self.rows.findIndex((row) =>
                                  (row as Record<string, unknown>)[firstColumn] === firstValue
                                  && (row as Record<string, unknown>)[secondColumn] === secondValue
                                  && row.used_at == null
                                  && row.expires_at > nowIso);
                                if (index < 0) return { data: null, error: null };
                                self.rows[index] = { ...self.rows[index], used_at: String(patch.used_at) };
                                return { data: self.rows[index], error: null };
                              },
                            };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
  }
}

function holderDid(): string {
  const { publicKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  return encodeDidKeyFromRawPublicKey(new Uint8Array(der.subarray(der.byteLength - 32)));
}

function store(db: FakePresentationDb, requirePersistence = true) {
  return new DurableSsiPresentationChallengeStore(
    () => Date.parse("2026-11-06T00:00:00.000Z"),
    db as unknown as PresentationChallengeDb,
    requirePersistence,
  );
}

function statusOf(err: unknown): number | undefined {
  return (err as { statusCode?: number }).statusCode;
}

const credentials = [{
  id: "33333333-3333-4333-8333-333333333333",
  hash: "a".repeat(64),
}];

describe("durable SSI presentation challenges", () => {
  it("persists one challenge and keeps the signing claims format", async () => {
    const db = new FakePresentationDb();
    const challenges = store(db);
    const created = await challenges.issue({
      learnerUserId: LEARNER,
      holderDid: holderDid(),
      audience: "sijil-recruiter-verify",
      credentials,
    });
    assert.equal(created.claims.protocol, SSI_PRESENT_PROTOCOL);
    assert.equal(created.claims.audience, "sijil-recruiter-verify");
    assert.equal(db.rows.length, 1);
    assert.equal(db.rows[0]?.used_at, null);
    const consumed = await challenges.consume(created.id, LEARNER);
    assert.equal(consumed.claims.protocol, SSI_PRESENT_PROTOCOL);
    assert.equal(consumed.claims.nonce, created.claims.nonce);
    assert.ok(consumed.usedAt);
    await assert.rejects(
      () => challenges.consume(created.id, LEARNER),
      (err: unknown) => statusOf(err) === 409,
    );
  });

  it("lets only one of two concurrent consumes succeed", async () => {
    const db = new FakePresentationDb();
    const challenges = store(db);
    const created = await challenges.issue({
      learnerUserId: LEARNER,
      holderDid: holderDid(),
      audience: "sijil-recruiter-verify",
      credentials,
    });
    const results = await Promise.allSettled([
      challenges.consume(created.id, LEARNER),
      challenges.consume(created.id, LEARNER),
    ]);
    const fulfilled = results.filter((item) => item.status === "fulfilled");
    const rejected = results.filter((item) => item.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(statusOf((rejected[0] as PromiseRejectedResult).reason), 409);
    assert.equal(db.rows.filter((row) => row.used_at).length, 1);
  });

  it("rejects a different learner without consuming the challenge", async () => {
    const db = new FakePresentationDb();
    const challenges = store(db);
    const created = await challenges.issue({
      learnerUserId: LEARNER,
      holderDid: holderDid(),
      audience: "sijil-recruiter-verify",
      credentials,
    });
    await assert.rejects(
      () => challenges.consume(created.id, OTHER),
      (err: unknown) => statusOf(err) === 403,
    );
    assert.equal(db.rows[0]?.used_at, null);
  });

  it("fails closed in production when the table is missing or the database is down", async () => {
    const missing = new FakePresentationDb();
    missing.missing = true;
    await assert.rejects(
      () => store(missing, true).issue({
        learnerUserId: LEARNER,
        holderDid: holderDid(),
        audience: "sijil-recruiter-verify",
        credentials,
      }),
      (err: unknown) => statusOf(err) === 503 && /migration is applied/.test((err as Error).message),
    );
    assert.equal(missing.rows.length, 0);

    const down = new FakePresentationDb();
    down.down = true;
    await assert.rejects(
      () => store(down, true).issue({
        learnerUserId: LEARNER,
        holderDid: holderDid(),
        audience: "sijil-recruiter-verify",
        credentials,
      }),
      (err: unknown) => statusOf(err) === 503 && /temporarily unavailable/.test((err as Error).message),
    );

    const insertFails = new FakePresentationDb();
    insertFails.failInsert = true;
    const challenges = store(insertFails, true);
    await assert.rejects(
      () => challenges.issue({
        learnerUserId: LEARNER,
        holderDid: holderDid(),
        audience: "sijil-recruiter-verify",
        credentials,
      }),
      (err: unknown) => statusOf(err) === 503,
    );
    await assert.rejects(() => challenges.peek("11111111-1111-4111-8111-111111111111"), /Unknown or expired/);
  });

  it("uses process memory outside production when the table is missing", async () => {
    const db = new FakePresentationDb();
    db.missing = true;
    const created = await store(db, false).issue({
      learnerUserId: LEARNER,
      holderDid: holderDid(),
      audience: "sijil-recruiter-verify",
      credentials,
    });
    assert.equal(created.claims.protocol, SSI_PRESENT_PROTOCOL);
    assert.equal(db.rows.length, 0);
  });
});
