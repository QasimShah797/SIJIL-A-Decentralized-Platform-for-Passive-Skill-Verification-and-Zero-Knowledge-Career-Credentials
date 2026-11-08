/**
 * Durable SSI bind challenges.
 * Postgres is the source of truth so a restart or a second process can consume
 * the same challenge. Production does not fall back to process memory.
 * Rows store the signed payload only. Private keys are never written.
 */
import { supabaseService } from "./supabase.service";
import { isMissingRelationError } from "../utils/supabase-errors";
import {
  SsiChallengeStore,
  createBindChallenge,
  type SsiChallengeRecord,
} from "./ssi-challenge.store";

export const SSI_BIND_CHALLENGE_TABLE = "ssi_bind_challenges";

const UNAVAILABLE = "SSI activation is temporarily unavailable. Try again in a moment.";
const MIGRATION_REQUIRED = "SSI activation storage is not ready. Try again after the bind-challenge migration is applied.";

type BindChallengeRow = {
  id: string;
  learner_user_id: string;
  nonce: string;
  purpose: string;
  audience: string;
  payload: string;
  expires_at: string;
  used_at: string | null;
};

type QueryResult = { data: BindChallengeRow | null; error: { message?: string; code?: string } | null };
type ProbeResult = { error: { message?: string; code?: string } | null };

export type BindChallengeDb = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => Promise<{ error: { message?: string; code?: string } | null }>;
    select: (columns: string) => {
      eq: (column: string, value: string) => { maybeSingle: () => Promise<QueryResult> };
      limit: (n: number) => Promise<ProbeResult>;
    };
    update: (row: Record<string, unknown>) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          is: (column: string, value: null) => {
            gt: (column: string, value: string) => {
              select: (columns: string) => { maybeSingle: () => Promise<QueryResult> };
            };
          };
        };
      };
    };
  };
};

function fail(message: string, statusCode: number): never {
  throw Object.assign(new Error(message), { statusCode });
}

export function bindChallengeFromRow(row: BindChallengeRow): SsiChallengeRecord {
  return {
    id: row.id,
    userId: row.learner_user_id,
    nonce: row.nonce,
    purpose: row.purpose,
    audience: row.audience,
    payload: row.payload,
    expiresAt: Date.parse(row.expires_at),
    usedAt: row.used_at ? Date.parse(row.used_at) : null,
  };
}

let warnedMemoryFallback = false;

export class DurableSsiBindChallengeStore {
  private postgresReady: boolean | null = null;
  private usingMemory = false;
  private readonly memory: SsiChallengeStore;

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly db: BindChallengeDb = supabaseService.client as unknown as BindChallengeDb,
    private readonly requirePersistence: boolean = process.env.NODE_ENV === "production",
  ) {
    this.memory = new SsiChallengeStore(now);
  }

  private async ensureBackend(): Promise<"memory" | "postgres"> {
    if (this.usingMemory) return "memory";
    if (this.postgresReady === true) return "postgres";
    const { error } = await this.db.from(SSI_BIND_CHALLENGE_TABLE).select("id").limit(1);
    if (!error) {
      this.postgresReady = true;
      return "postgres";
    }
    if (isMissingRelationError(error) && !this.requirePersistence) {
      this.usingMemory = true;
      this.postgresReady = false;
      if (!warnedMemoryFallback) {
        warnedMemoryFallback = true;
        console.warn(
          "[ssi] ssi_bind_challenges is unavailable. Bind challenges are process-local because NODE_ENV is not production.",
        );
      }
      return "memory";
    }
    if (isMissingRelationError(error)) {
      fail(MIGRATION_REQUIRED, 503);
    }
    fail(UNAVAILABLE, 503);
  }

  async issue(userId: string): Promise<SsiChallengeRecord> {
    const record = createBindChallenge(userId, this.now());
    if ((await this.ensureBackend()) === "memory") {
      return this.memory.hold(record);
    }
    const { error } = await this.db.from(SSI_BIND_CHALLENGE_TABLE).insert({
      id: record.id,
      learner_user_id: record.userId,
      nonce: record.nonce,
      purpose: record.purpose,
      audience: record.audience,
      payload: record.payload,
      expires_at: new Date(record.expiresAt).toISOString(),
      used_at: null,
    });
    if (error && isMissingRelationError(error) && !this.requirePersistence) {
      this.usingMemory = true;
      this.postgresReady = false;
      return this.memory.hold(record);
    }
    if (error) {
      fail(isMissingRelationError(error) ? MIGRATION_REQUIRED : UNAVAILABLE, 503);
    }
    return record;
  }

  async peek(id: string, userId: string): Promise<SsiChallengeRecord> {
    if ((await this.ensureBackend()) === "memory") return this.memory.peek(id, userId);
    const row = await this.readRow(id);
    return this.assertUsable(row, userId);
  }

  async consume(id: string, userId: string): Promise<SsiChallengeRecord> {
    if ((await this.ensureBackend()) === "memory") return this.memory.consume(id, userId);
    const nowIso = new Date(this.now()).toISOString();
    const { data, error } = await this.db
      .from(SSI_BIND_CHALLENGE_TABLE)
      .update({ used_at: nowIso })
      .eq("id", id)
      .eq("learner_user_id", userId)
      .is("used_at", null)
      .gt("expires_at", nowIso)
      .select("*")
      .maybeSingle();
    if (error) {
      fail(isMissingRelationError(error) ? MIGRATION_REQUIRED : UNAVAILABLE, 503);
    }
    if (!data) {
      const row = await this.readRow(id);
      this.assertUsable(row, userId);
      fail("Challenge has already been used", 409);
    }
    return bindChallengeFromRow({ ...data, used_at: data.used_at ?? nowIso });
  }

  private async readRow(id: string): Promise<BindChallengeRow | null> {
    const { data, error } = await this.db.from(SSI_BIND_CHALLENGE_TABLE).select("*").eq("id", id).maybeSingle();
    if (error) {
      fail(isMissingRelationError(error) ? MIGRATION_REQUIRED : UNAVAILABLE, 503);
    }
    return data;
  }

  private assertUsable(row: BindChallengeRow | null, userId: string): SsiChallengeRecord {
    if (!row) fail("Unknown or expired challenge", 400);
    if (row.learner_user_id !== userId) {
      fail("Challenge was issued to a different account", 403);
    }
    if (row.used_at != null) fail("Challenge has already been used", 409);
    if (Date.parse(row.expires_at) <= this.now()) fail("Challenge has expired", 400);
    return bindChallengeFromRow(row);
  }
}
