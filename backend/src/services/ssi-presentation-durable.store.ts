/**
 * Presentation challenges: Postgres when ssi_presentation_challenges exists.
 * Production does not fall back to process memory. Consume is
 * UPDATE … WHERE used_at IS NULL. The signed claims bytes are unchanged.
 */
import { supabaseService } from "./supabase.service";
import { isMissingRelationError } from "../utils/supabase-errors";
import { buildPresentationSigningClaims } from "./ssi-presentation-protocol";
import {
  SsiPresentationChallengeStore,
  type PresentationChallengeRecord,
} from "./ssi-presentation-challenge.store";

const TABLE = "ssi_presentation_challenges";
const UNAVAILABLE = "Presentation signing is temporarily unavailable. Try again in a moment.";
const MIGRATION_REQUIRED = "Presentation signing storage is not ready. Try again after the presentation-challenge migration is applied.";

type ChallengeRow = {
  id: string;
  learner_user_id: string;
  holder_did: string;
  audience: string;
  nonce: string;
  credential_ids: unknown;
  credential_hashes: unknown;
  claims: unknown;
  issued_at: string;
  expires_at: string;
  used_at: string | null;
};

type QueryResult = { data: ChallengeRow | null; error: { message?: string; code?: string } | null };

export type PresentationChallengeDb = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => Promise<{ error: { message?: string; code?: string } | null }>;
    select: (columns: string) => {
      eq: (column: string, value: string) => { maybeSingle: () => Promise<QueryResult> };
      limit: (n: number) => Promise<{ error: { message?: string; code?: string } | null }>;
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

let warnedMemoryFallback = false;

export class DurableSsiPresentationChallengeStore extends SsiPresentationChallengeStore {
  private postgresReady: boolean | null = null;
  private usingMemory = false;

  constructor(
    private readonly clock: () => number = () => Date.now(),
    private readonly db: PresentationChallengeDb = supabaseService.client as unknown as PresentationChallengeDb,
    private readonly requirePersistence: boolean = process.env.NODE_ENV === "production",
  ) {
    super(clock);
  }

  private async ensureBackend(): Promise<"memory" | "postgres"> {
    if (this.usingMemory) return "memory";
    if (this.postgresReady === true) return "postgres";
    const { error } = await this.db.from(TABLE).select("id").limit(1);
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
          "[ssi] ssi_presentation_challenges is unavailable. Presentation challenges are process-local because NODE_ENV is not production.",
        );
      }
      return "memory";
    }
    if (isMissingRelationError(error)) fail(MIGRATION_REQUIRED, 503);
    fail(UNAVAILABLE, 503);
  }

  override async issue(input: {
    learnerUserId: string;
    holderDid: string;
    audience: string;
    credentials: { id: string; hash: string }[];
    ttlMs?: number;
  }): Promise<PresentationChallengeRecord> {
    const backend = await this.ensureBackend();
    const record = await super.issue(input);
    if (backend === "memory") return record;
    const { error } = await this.db.from(TABLE).insert({
      id: record.id,
      learner_user_id: record.learnerUserId,
      holder_did: record.holderDid,
      audience: record.audience,
      nonce: record.nonce,
      credential_ids: record.credentials.map((row) => row.id),
      credential_hashes: record.credentials.map((row) => row.hash),
      claims: record.claims,
      issued_at: record.issuedAt,
      expires_at: record.expiresAt,
      used_at: null,
    });
    if (error) {
      await super.discardUnused(record.id);
      fail(isMissingRelationError(error) ? MIGRATION_REQUIRED : UNAVAILABLE, 503);
    }
    return record;
  }

  override async getIncludingUsed(id: string): Promise<PresentationChallengeRecord> {
    if ((await this.ensureBackend()) === "memory") return super.getIncludingUsed(id);
    const row = await this.readRow(id);
    if (!row) fail("Unknown presentation challenge", 404);
    return fromRow(row);
  }

  override async peek(id: string): Promise<PresentationChallengeRecord> {
    if ((await this.ensureBackend()) === "memory") return super.peek(id);
    return this.assertUsable(await this.readRow(id), null);
  }

  override async consume(id: string, learnerUserId: string): Promise<PresentationChallengeRecord> {
    if ((await this.ensureBackend()) === "memory") return super.consume(id, learnerUserId);
    const nowIso = new Date(this.clock()).toISOString();
    const { data, error } = await this.db
      .from(TABLE)
      .update({ used_at: nowIso })
      .eq("id", id)
      .eq("learner_user_id", learnerUserId)
      .is("used_at", null)
      .gt("expires_at", nowIso)
      .select("*")
      .maybeSingle();
    if (error) fail(isMissingRelationError(error) ? MIGRATION_REQUIRED : UNAVAILABLE, 503);
    if (!data) {
      this.assertUsable(await this.readRow(id), learnerUserId);
      fail("Presentation challenge has already been used", 409);
    }
    await super.discardUnused(id);
    return fromRow({ ...data, used_at: data.used_at ?? nowIso });
  }

  private async readRow(id: string): Promise<ChallengeRow | null> {
    const { data, error } = await this.db.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) fail(isMissingRelationError(error) ? MIGRATION_REQUIRED : UNAVAILABLE, 503);
    return data;
  }

  private assertUsable(row: ChallengeRow | null, learnerUserId: string | null): PresentationChallengeRecord {
    if (!row) fail("Unknown or expired presentation challenge", 400);
    if (learnerUserId && row.learner_user_id !== learnerUserId) {
      fail("Challenge was issued to a different account", 403);
    }
    if (row.used_at != null) fail("Presentation challenge has already been used", 409);
    if (Date.parse(row.expires_at) <= this.clock()) fail("Presentation challenge has expired", 400);
    return fromRow(row);
  }
}

function fromRow(row: ChallengeRow): PresentationChallengeRecord {
  const ids = Array.isArray(row.credential_ids) ? row.credential_ids.map(String) : [];
  const hashes = Array.isArray(row.credential_hashes) ? row.credential_hashes.map(String) : [];
  const credentials = ids.map((id, index) => ({ id, hash: hashes[index] ?? "" }));
  const storedClaims = row.claims && typeof row.claims === "object"
    ? row.claims as Parameters<typeof buildPresentationSigningClaims>[0]
    : {
      challengeId: row.id,
      nonce: row.nonce,
      audience: row.audience,
      holderDid: row.holder_did,
      credentials,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
    };
  const claims = buildPresentationSigningClaims(storedClaims);
  return {
    id: row.id,
    learnerUserId: row.learner_user_id,
    holderDid: claims.holderDid,
    audience: claims.audience,
    nonce: claims.nonce,
    credentialIds: claims.credentials.map((item) => item.id),
    credentials: claims.credentials,
    issuedAt: claims.issuedAt,
    expiresAt: claims.expiresAt,
    usedAt: row.used_at ? Date.parse(row.used_at) : null,
    claims,
  };
}
