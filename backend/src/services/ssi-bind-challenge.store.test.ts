import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateKeyPairSync, sign } from "node:crypto";
import { SSI_CHALLENGE_TTL_MS } from "./ssi-challenge.store";
import {
  DurableSsiBindChallengeStore,
  type BindChallengeDb,
} from "./ssi-bind-challenge.store";
import { encodeDidKeyFromRawPublicKey } from "../utils/did-key";
import { SsiService } from "./ssi.service";
import { errorMiddleware } from "../middleware/error.middleware";
import type { Request, Response } from "express";

type Row = {
  id: string;
  learner_user_id: string;
  nonce: string;
  purpose: string;
  audience: string;
  payload: string;
  expires_at: string;
  used_at: string | null;
};

const MISSING = { code: "42P01", message: "could not find the table public.ssi_bind_challenges" };
const DOWN = { code: "08006", message: "connection refused" };

class FakeBindDb {
  rows: Row[] = [];
  missing = false;
  down = false;

  from(_table: string) {
    const self = this;
    return {
      async insert(row: Record<string, unknown>) {
        if (self.missing) return { error: MISSING };
        if (self.down) return { error: DOWN };
        self.rows.push({
          id: String(row.id),
          learner_user_id: String(row.learner_user_id),
          nonce: String(row.nonce),
          purpose: String(row.purpose),
          audience: String(row.audience),
          payload: String(row.payload),
          expires_at: String(row.expires_at),
          used_at: row.used_at == null ? null : String(row.used_at),
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
                const data = self.rows.find((row) => (row as Record<string, string | null>)[column] === value) ?? null;
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
                                  (row as Record<string, string | null>)[firstColumn] === firstValue
                                  && (row as Record<string, string | null>)[secondColumn] === secondValue
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

function store(db: FakeBindDb, now: () => number, requirePersistence = true) {
  return new DurableSsiBindChallengeStore(now, db as unknown as BindChallengeDb, requirePersistence);
}

function statusOf(err: unknown): number | undefined {
  return (err as { statusCode?: number }).statusCode;
}

describe("durable SSI bind challenges", () => {
  it("creates a 32-byte challenge and consumes it once", async () => {
    let now = Date.parse("2026-11-06T00:00:00.000Z");
    const db = new FakeBindDb();
    const challenges = store(db, () => now);
    const userId = "11111111-1111-4111-8111-111111111111";
    const created = await challenges.issue(userId);
    assert.equal(Buffer.from(created.nonce, "base64url").length, 32);
    assert.equal(created.expiresAt - now, SSI_CHALLENGE_TTL_MS);
    assert.match(created.payload, /^SIJIL-SSI-BIND-v1\n/);
    assert.match(created.payload, new RegExp(`userId=${userId}`));
    assert.equal(db.rows.length, 1);
    assert.equal(db.rows[0]?.used_at, null);
    assert.equal(JSON.stringify(db.rows[0]).includes("PRIVATE KEY"), false);

    const peeked = await challenges.peek(created.id, userId);
    assert.equal(peeked.payload, created.payload);
    assert.equal(db.rows[0]?.used_at, null);

    const consumed = await challenges.consume(created.id, userId);
    assert.equal(consumed.usedAt, now);
    assert.equal(db.rows[0]?.used_at, new Date(now).toISOString());
  });

  it("rejects an expired challenge without consuming it", async () => {
    let now = 1_000_000;
    const db = new FakeBindDb();
    const challenges = store(db, () => now);
    const userId = "11111111-1111-4111-8111-111111111111";
    const created = await challenges.issue(userId);
    now += SSI_CHALLENGE_TTL_MS + 1;
    await assert.rejects(() => challenges.peek(created.id, userId), /expired/);
    await assert.rejects(
      () => challenges.consume(created.id, userId),
      (err: unknown) => statusOf(err) === 400 && /expired/.test((err as Error).message),
    );
    assert.equal(db.rows[0]?.used_at, null);
  });

  it("rejects replay of a consumed challenge", async () => {
    const db = new FakeBindDb();
    const challenges = store(db, () => Date.parse("2026-11-06T00:00:00.000Z"));
    const userId = "11111111-1111-4111-8111-111111111111";
    const created = await challenges.issue(userId);
    await challenges.consume(created.id, userId);
    await assert.rejects(
      () => challenges.consume(created.id, userId),
      (err: unknown) => statusOf(err) === 409 && /already been used/.test((err as Error).message),
    );
    await assert.rejects(() => challenges.peek(created.id, userId), /already been used/);
  });

  it("lets only one of two concurrent consumes succeed", async () => {
    const db = new FakeBindDb();
    const challenges = store(db, () => Date.parse("2026-11-06T00:00:00.000Z"));
    const userId = "11111111-1111-4111-8111-111111111111";
    const created = await challenges.issue(userId);
    const results = await Promise.allSettled([
      challenges.consume(created.id, userId),
      challenges.consume(created.id, userId),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.match((rejected[0] as PromiseRejectedResult).reason.message, /already been used/);
    assert.equal(db.rows.filter((row) => row.used_at != null).length, 1);
  });

  it("survives a new store instance that shares the same database", async () => {
    const now = () => Date.parse("2026-11-06T00:00:00.000Z");
    const db = new FakeBindDb();
    const userId = "11111111-1111-4111-8111-111111111111";
    const first = store(db, now);
    const created = await first.issue(userId);
    const restarted = store(db, now);
    const peeked = await restarted.peek(created.id, userId);
    assert.equal(peeked.payload, created.payload);
    await restarted.consume(created.id, userId);
    await assert.rejects(() => store(db, now).consume(created.id, userId), /already been used/);
  });

  it("rejects a different learner and leaves the challenge unused", async () => {
    const db = new FakeBindDb();
    const challenges = store(db, () => Date.parse("2026-11-06T00:00:00.000Z"));
    const alice = "11111111-1111-4111-8111-111111111111";
    const bob = "22222222-2222-4222-8222-222222222222";
    const created = await challenges.issue(alice);
    await assert.rejects(
      () => challenges.peek(created.id, bob),
      (err: unknown) => statusOf(err) === 403,
    );
    await assert.rejects(
      () => challenges.consume(created.id, bob),
      (err: unknown) => statusOf(err) === 403 && /different account/.test((err as Error).message),
    );
    assert.equal(db.rows[0]?.used_at, null);
    const consumed = await challenges.consume(created.id, alice);
    assert.equal(consumed.userId, alice);
  });

  it("fails closed in production when the table or database is unavailable", async () => {
    const missing = new FakeBindDb();
    missing.missing = true;
    const production = store(missing, () => Date.now(), true);
    await assert.rejects(
      () => production.issue("11111111-1111-4111-8111-111111111111"),
      (err: unknown) => statusOf(err) === 503 && /migration is applied/.test((err as Error).message),
    );
    assert.equal(missing.rows.length, 0);

    const down = new FakeBindDb();
    down.down = true;
    await assert.rejects(
      () => store(down, () => Date.now(), true).issue("11111111-1111-4111-8111-111111111111"),
      (err: unknown) => statusOf(err) === 503 && /temporarily unavailable/.test((err as Error).message),
    );
    await assert.rejects(
      () => store(down, () => Date.now(), false).peek("11111111-1111-4111-8111-111111111111", "11111111-1111-4111-8111-111111111111"),
      (err: unknown) => statusOf(err) === 503,
    );
  });

  it("returns HTTP 503 when the challenge cannot be issued", async () => {
    const db = new FakeBindDb();
    db.down = true;
    const service = new SsiService(store(db, Date.now, true));
    let status: number | undefined;
    let body: unknown;
    const response = {
      status(code: number) { status = code; return this; },
      json(result: unknown) { body = result; return this; },
    };
    await assert.rejects(() => service.issueChallenge("11111111-1111-4111-8111-111111111111"), (error: Error) => {
      errorMiddleware(error, {} as Request, response as unknown as Response, () => undefined);
      return true;
    });
    assert.equal(status, 503);
    assert.match((body as { message: string }).message, /temporarily unavailable/);
    assert.equal(db.rows.length, 0);
  });

  it("uses process memory only outside production when the table is absent", async () => {
    const db = new FakeBindDb();
    db.missing = true;
    const now = () => Date.parse("2026-11-06T00:00:00.000Z");
    const local = store(db, now, false);
    const userId = "11111111-1111-4111-8111-111111111111";
    const created = await local.issue(userId);
    assert.equal(db.rows.length, 0);
    const peeked = await local.peek(created.id, userId);
    assert.equal(peeked.id, created.id);
    const otherProcess = store(db, now, false);
    await assert.rejects(() => otherProcess.peek(created.id, userId), /Unknown or expired/);
  });

  it("binds through a restarted store without changing the signed payload", async () => {
    const db = new FakeBindDb();
    const now = () => Date.parse("2026-11-06T00:00:00.000Z");
    const userId = "11111111-1111-4111-8111-111111111111";
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const der = publicKey.export({ type: "spki", format: "der" }) as Buffer;
    const did = encodeDidKeyFromRawPublicKey(new Uint8Array(der.subarray(der.byteLength - 32)));
    const issued = await store(db, now).issue(userId);
    const signature = sign(null, Buffer.from(`${issued.payload}\ndid=${did}`, "utf8"), privateKey).toString("base64url");
    const identities = {
      from() {
        const filters: Record<string, string> = {};
        const rows: Array<Record<string, string>> = [];
        const builder = {
          select() { return builder; },
          eq(column: string, value: string) { filters[column] = value; return builder; },
          async maybeSingle() {
            const data = rows.find((row) => Object.entries(filters).every(([key, value]) => row[key] === value)) ?? null;
            return { data, error: null };
          },
          async insert(row: Record<string, string>) {
            rows.push(row);
            return { error: null };
          },
        };
        return builder;
      },
    };
    const service = new SsiService(store(db, now), identities as never);
    const bound = await service.bindIdentity(userId, {
      challengeId: issued.id,
      did,
      signature,
    });
    assert.equal(bound.did, did);
    assert.equal(db.rows[0]?.used_at != null, true);
  });

  it("migration grants service role only and stores no private key column", () => {
    const sql = readFileSync(resolve(process.cwd(), "../supabase/migrations/20261106013000_ssi_bind_challenges.sql"), "utf8");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.ssi_bind_challenges/);
    assert.match(sql, /GRANT ALL ON TABLE public\.ssi_bind_challenges TO service_role/);
    assert.match(sql, /REVOKE ALL ON TABLE public\.ssi_bind_challenges FROM PUBLIC, anon, authenticated/);
    assert.match(sql, /WHERE used_at IS NULL/);
    assert.equal(/private_key/i.test(sql), false);
  });
});
