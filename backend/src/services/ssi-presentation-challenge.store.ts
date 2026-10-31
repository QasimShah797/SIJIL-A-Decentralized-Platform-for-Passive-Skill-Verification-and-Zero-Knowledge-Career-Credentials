import { randomBytes, randomUUID } from "node:crypto";
import {
  buildPresentationSigningClaims,
  type PresentationCredentialRef,
  type PresentationSigningClaims,
} from "./ssi-presentation-protocol";

export const SSI_PRESENT_CHALLENGE_TTL_MS = 15 * 60 * 1000;
export const SSI_PRESENT_DEFAULT_AUDIENCE = "sijil-recruiter-verify";

export type PresentationChallengeRecord = {
  id: string;
  learnerUserId: string;
  holderDid: string;
  audience: string;
  nonce: string;
  credentialIds: string[];
  credentials: PresentationCredentialRef[];
  issuedAt: string;
  expiresAt: string;
  usedAt: number | null;
  claims: PresentationSigningClaims;
};

export class SsiPresentationChallengeStore {
  private readonly rows = new Map<string, PresentationChallengeRecord>();
  private readonly inflight = new Set<string>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async issue(input: {
    learnerUserId: string;
    holderDid: string;
    audience: string;
    credentials: PresentationCredentialRef[];
    ttlMs?: number;
  }): Promise<PresentationChallengeRecord> {
    this.prune();
    const id = randomUUID();
    const nonce = randomBytes(32).toString("base64url");
    const issuedAt = new Date(this.now()).toISOString();
    const expiresAt = new Date(this.now() + (input.ttlMs ?? SSI_PRESENT_CHALLENGE_TTL_MS)).toISOString();
    const claims = buildPresentationSigningClaims({
      challengeId: id,
      nonce,
      audience: input.audience,
      holderDid: input.holderDid,
      credentials: input.credentials,
      issuedAt,
      expiresAt,
    });
    const record: PresentationChallengeRecord = {
      id,
      learnerUserId: input.learnerUserId,
      holderDid: claims.holderDid,
      audience: claims.audience,
      nonce: claims.nonce,
      credentialIds: claims.credentials.map((row) => row.id),
      credentials: claims.credentials,
      issuedAt: claims.issuedAt,
      expiresAt: claims.expiresAt,
      usedAt: null,
      claims,
    };
    this.rows.set(id, record);
    return record;
  }

  /** Loads claims even after consume; used to rebuild durable presentation envelopes. */
  async getIncludingUsed(id: string): Promise<PresentationChallengeRecord> {
    const record = this.rows.get(id);
    if (!record) {
      throw Object.assign(new Error("Unknown presentation challenge"), { statusCode: 404 });
    }
    return record;
  }

  async peek(id: string): Promise<PresentationChallengeRecord> {
    this.prune();
    const record = this.rows.get(id);
    if (!record) {
      throw Object.assign(new Error("Unknown or expired presentation challenge"), { statusCode: 400 });
    }
    if (record.usedAt != null) {
      throw Object.assign(new Error("Presentation challenge has already been used"), { statusCode: 409 });
    }
    if (Date.parse(record.expiresAt) <= this.now()) {
      this.rows.delete(id);
      throw Object.assign(new Error("Presentation challenge has expired"), { statusCode: 400 });
    }
    return record;
  }

  async begin(id: string, learnerUserId: string): Promise<PresentationChallengeRecord> {
    const record = await this.peek(id);
    if (record.learnerUserId !== learnerUserId) {
      throw Object.assign(new Error("Challenge was issued to a different account"), { statusCode: 403 });
    }
    if (this.inflight.has(id) || record.usedAt != null) {
      throw Object.assign(new Error("Presentation challenge has already been used"), { statusCode: 409 });
    }
    this.inflight.add(id);
    return record;
  }

  async consume(id: string, learnerUserId: string): Promise<PresentationChallengeRecord> {
    const record = this.rows.get(id);
    if (!record) {
      this.inflight.delete(id);
      throw Object.assign(new Error("Unknown or expired presentation challenge"), { statusCode: 400 });
    }
    if (record.learnerUserId !== learnerUserId) {
      this.inflight.delete(id);
      throw Object.assign(new Error("Challenge was issued to a different account"), { statusCode: 403 });
    }
    if (record.usedAt != null) {
      this.inflight.delete(id);
      throw Object.assign(new Error("Presentation challenge has already been used"), { statusCode: 409 });
    }
    record.usedAt = this.now();
    this.inflight.delete(id);
    return record;
  }

  async abort(id: string): Promise<void> {
    this.inflight.delete(id);
  }

  prune(): void {
    const now = this.now();
    for (const [id, row] of this.rows) {
      if (Date.parse(row.expiresAt) <= now) this.rows.delete(id);
    }
  }
}

export const ssiPresentationChallengeStore = new SsiPresentationChallengeStore();
