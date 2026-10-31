/**
 * Presentation challenges: Postgres when ssi_presentation_challenges exists,
 * otherwise the in-memory store. Consume is UPDATE … WHERE used_at IS NULL.
 */
import { supabaseService } from "./supabase.service";
import { isMissingRelationError } from "../utils/supabase-errors";
import { buildPresentationSigningClaims } from "./ssi-presentation-protocol";
import {
  SsiPresentationChallengeStore,
  type PresentationChallengeRecord,
} from "./ssi-presentation-challenge.store";

const TABLE = "ssi_presentation_challenges";

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

type ChallengeDb = {
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

export class DurableSsiPresentationChallengeStore extends SsiPresentationChallengeStore {
  private postgresReady: boolean | null = null;

  constructor(
    now: () => number = () => Date.now(),
    private readonly db: ChallengeDb = supabaseService.client as unknown as ChallengeDb,
  ) {
    super(now);
  }

  private async ensureBackend(): Promise<"memory" | "postgres"> {
    if (this.postgresReady === false) return "memory";
    if (this.postgresReady === true) return "postgres";
    const { error } = await this.db.from(TABLE).select("id").limit(1);
    if (error && isMissingRelationError(error)) {
      this.postgresReady = false;
      return "memory";
    }
    if (error) {
      throw Object.assign(new Error(error.message ?? "Presentation challenge table is unavailable"), { statusCode: 503 });
    }
    this.postgresReady = true;
    return "postgres";
  }

  override async issue(input: {
    learnerUserId: string;
    holderDid: string;
    audience: string;
    credentials: { id: string; hash: string }[];
    ttlMs?: number;
  }): Promise<PresentationChallengeRecord> {
    const record = await super.issue(input);
    if ((await this.ensureBackend()) === "memory") return record;
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
    if (error && isMissingRelationError(error)) {
      this.postgresReady = false;
      return record;
    }
    if (error) {
      throw Object.assign(new Error(error.message ?? "Could not persist presentation challenge"), { statusCode: 503 });
    }
    return record;
  }

  override async getIncludingUsed(id: string): Promise<PresentationChallengeRecord> {
    if ((await this.ensureBackend()) === "memory") return super.getIncludingUsed(id);
    const { data, error } = await this.db.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error && isMissingRelationError(error)) {
      this.postgresReady = false;
      return super.getIncludingUsed(id);
    }
    if (error) {
      throw Object.assign(new Error(error.message ?? "Could not load presentation challenge"), { statusCode: 503 });
    }
    if (!data) {
      throw Object.assign(new Error("Unknown presentation challenge"), { statusCode: 404 });
    }
    return fromRow(data);
  }

  override async peek(id: string): Promise<PresentationChallengeRecord> {
    if ((await this.ensureBackend()) === "memory") return super.peek(id);
    const { data, error } = await this.db.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error && isMissingRelationError(error)) {
      this.postgresReady = false;
      return super.peek(id);
    }
    if (error) {
      throw Object.assign(new Error(error.message ?? "Could not load presentation challenge"), { statusCode: 503 });
    }
    if (!data) {
      throw Object.assign(new Error("Unknown or expired presentation challenge"), { statusCode: 400 });
    }
    const record = fromRow(data);
    if (record.usedAt != null) {
      throw Object.assign(new Error("Presentation challenge has already been used"), { statusCode: 409 });
    }
    if (Date.parse(record.expiresAt) <= Date.now()) {
      throw Object.assign(new Error("Presentation challenge has expired"), { statusCode: 400 });
    }
    return record;
  }

  override async consume(id: string, learnerUserId: string): Promise<PresentationChallengeRecord> {
    if ((await this.ensureBackend()) === "memory") return super.consume(id, learnerUserId);
    const { data, error } = await this.db
      .from(TABLE)
      .update({ used_at: new Date().toISOString() })
      .eq("id", id)
      .eq("learner_user_id", learnerUserId)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("*")
      .maybeSingle();
    if (error && isMissingRelationError(error)) {
      this.postgresReady = false;
      return super.consume(id, learnerUserId);
    }
    if (error) {
      await super.abort(id);
      throw Object.assign(new Error(error.message ?? "Could not consume presentation challenge"), { statusCode: 503 });
    }
    if (!data) {
      await super.abort(id);
      throw Object.assign(new Error("Presentation challenge has already been used"), { statusCode: 409 });
    }
    const record = await super.consume(id, learnerUserId).catch(async () => {
      await super.abort(id);
      return fromRow(data);
    });
    return record;
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
