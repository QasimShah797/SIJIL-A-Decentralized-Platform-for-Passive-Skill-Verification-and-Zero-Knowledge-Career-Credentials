import { randomBytes, randomUUID } from "node:crypto";

export const SSI_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const SSI_CHALLENGE_PURPOSE = "bind-learner-did";
export const SSI_CHALLENGE_AUDIENCE = "sijil-express";

export type SsiChallengeRecord = {
  id: string;
  userId: string;
  nonce: string;
  purpose: string;
  audience: string;
  payload: string;
  expiresAt: number;
  usedAt: number | null;
};

export class SsiChallengeStore {
  private readonly rows = new Map<string, SsiChallengeRecord>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  issue(userId: string): SsiChallengeRecord {
    this.prune();
    const id = randomUUID();
    const nonce = randomBytes(32).toString("base64url");
    const expiresAt = this.now() + SSI_CHALLENGE_TTL_MS;
    const payload = [
      "SIJIL-SSI-BIND-v1",
      `audience=${SSI_CHALLENGE_AUDIENCE}`,
      `purpose=${SSI_CHALLENGE_PURPOSE}`,
      `userId=${userId}`,
      `challengeId=${id}`,
      `nonce=${nonce}`,
      `expiresAt=${new Date(expiresAt).toISOString()}`,
    ].join("\n");
    const record: SsiChallengeRecord = {
      id,
      userId,
      nonce,
      purpose: SSI_CHALLENGE_PURPOSE,
      audience: SSI_CHALLENGE_AUDIENCE,
      payload,
      expiresAt,
      usedAt: null,
    };
    this.rows.set(id, record);
    return record;
  }

  peek(id: string, userId: string): SsiChallengeRecord {
    const record = this.rows.get(id);
    if (!record) throw Object.assign(new Error("Unknown or expired challenge"), { statusCode: 400 });
    if (record.userId !== userId) {
      throw Object.assign(new Error("Challenge was issued to a different account"), { statusCode: 403 });
    }
    if (record.usedAt != null) {
      throw Object.assign(new Error("Challenge has already been used"), { statusCode: 409 });
    }
    if (record.expiresAt <= this.now()) {
      this.rows.delete(id);
      throw Object.assign(new Error("Challenge has expired"), { statusCode: 400 });
    }
    return record;
  }

  consume(id: string, userId: string): SsiChallengeRecord {
    const record = this.peek(id, userId);
    record.usedAt = this.now();
    return record;
  }

  prune(): void {
    const now = this.now();
    for (const [id, row] of this.rows) {
      if (row.expiresAt <= now || row.usedAt != null) this.rows.delete(id);
    }
  }
}

export const ssiChallengeStore = new SsiChallengeStore();
