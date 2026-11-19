/**
 * In-app verification requests and notifications.
 * The practical-score Groth16 request remains in its own table.
 * This layer stores only public labels. It never stores a score, count, grade, blinding value, or witness.
 */
import { randomUUID } from "node:crypto";
import { AppError } from "../utils/AppError";
import { isMissingColumnError, isUniqueViolation } from "../utils/supabase-errors";

export const VERIFICATION_CATEGORIES = [
  "practical-score",
  "github-activity",
  "moodle-performance",
  "skill-progression",
] as const;

export type VerificationCategory = (typeof VERIFICATION_CATEGORIES)[number];

export const VERIFICATION_STATUSES = [
  "pending",
  "approved",
  "generating",
  "verified",
  "failed",
  "unsatisfied",
  "rejected",
  "expired",
  "cancelled",
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export type NotificationKind = "request_created" | "approved" | "rejected" | "verified" | "expired" | "failed";

export interface VerificationRequestRecord {
  id: string;
  legacyScoreRequestId: string | null;
  recruiterUserId: string;
  learnerUserId: string;
  recruiterLabel: string;
  learnerLabel: string;
  category: VerificationCategory;
  skillLabel: string;
  policyLabel: string;
  /** Structured public threshold. GitHub activity uses 50, 100, or 150. */
  threshold: number | null;
  status: VerificationStatus;
  expiresAt: string;
  createdAt: string;
}

export interface VerificationNotificationRecord {
  id: string;
  recipientUserId: string;
  requestId: string;
  audience: "learner" | "recruiter";
  kind: NotificationKind;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export function practicalRequestCopy(input: {
  recruiterLabel: string;
  skillLabel: string;
  threshold: number;
}): { title: string; body: string } {
  const title = "New verification request";
  const body = `A recruiter has requested verification of your ${input.skillLabel} skill with a minimum threshold of ${input.threshold}%. Please open your Wallet to review this request.`;
  return { title, body };
}

export const GITHUB_ACTIVITY_THRESHOLDS = [50, 100, 150] as const;

export function githubActivityRequestCopy(threshold: number): { title: string; body: string } {
  return {
    title: "New verification request",
    body: `A recruiter has requested verification that your connected GitHub account authored at least ${threshold} unique commits in a repository you choose. Please open your Wallet to review this request.`,
  };
}

export function recruiterResultCopy(kind: Exclude<NotificationKind, "request_created">, learnerLabel: string): { title: string; body: string } {
  if (kind === "approved") {
    return { title: "Verification request approved", body: `${learnerLabel} approved your verification request. Open the candidate verification card to follow it. The exact score was not revealed.` };
  }
  if (kind === "rejected") {
    return { title: "Verification request declined", body: "The learner declined your verification request. Open the candidate verification card to review it." };
  }
  if (kind === "verified") {
    return { title: "Verification request verified", body: "Your requested proof has been verified. Open the candidate verification card to see the result. The exact score was not revealed." };
  }
  if (kind === "expired") {
    return { title: "Verification request expired", body: "The verification request expired. Open the candidate verification card to review it." };
  }
  return { title: "Verification request failed", body: "The proof was not accepted. Open the candidate verification card to review it. The exact score was not revealed." };
}

export interface VerificationDirectory {
  findByLegacy(legacyScoreRequestId: string): Promise<VerificationRequestRecord | null>;
  findById(id: string): Promise<VerificationRequestRecord | null>;
  insertRequest(row: VerificationRequestRecord): Promise<VerificationRequestRecord>;
  updateStatus(id: string, status: VerificationStatus): Promise<VerificationRequestRecord | null>;
  claimStatus(id: string, from: VerificationStatus[], status: VerificationStatus): Promise<VerificationRequestRecord | null>;
  listForLearner(learnerUserId: string): Promise<VerificationRequestRecord[]>;
  listForRecruiter(recruiterUserId: string): Promise<VerificationRequestRecord[]>;
  insertNotification(row: VerificationNotificationRecord): Promise<"created" | "duplicate">;
  listNotifications(recipientUserId: string): Promise<VerificationNotificationRecord[]>;
  markRead(id: string, recipientUserId: string): Promise<VerificationNotificationRecord | null>;
}

export function createMemoryVerificationDirectory(): VerificationDirectory {
  const requests: VerificationRequestRecord[] = [];
  const notifications: VerificationNotificationRecord[] = [];
  return {
    async findByLegacy(legacyScoreRequestId) {
      return requests.find((row) => row.legacyScoreRequestId === legacyScoreRequestId) ?? null;
    },
    async findById(id) {
      return requests.find((row) => row.id === id) ?? null;
    },
    async insertRequest(row) {
      requests.push(row);
      return row;
    },
    async updateStatus(id, status) {
      const row = requests.find((item) => item.id === id);
      if (!row) return null;
      row.status = status;
      return row;
    },
    async claimStatus(id, from, status) {
      const row = requests.find((item) => item.id === id && from.includes(item.status));
      if (!row) return null;
      row.status = status;
      return row;
    },
    async listForLearner(learnerUserId) {
      return requests.filter((row) => row.learnerUserId === learnerUserId);
    },
    async listForRecruiter(recruiterUserId) {
      return requests.filter((row) => row.recruiterUserId === recruiterUserId);
    },
    async insertNotification(row) {
      const request = requests.find((item) => item.id === row.requestId);
      if (!request) throw new Error("verification request is missing");
      const learnerNotice = row.audience === "learner"
        && row.recipientUserId === request.learnerUserId
        && row.kind === "request_created";
      const recruiterNotice = row.audience === "recruiter"
        && row.recipientUserId === request.recruiterUserId
        && row.kind !== "request_created";
      if (!learnerNotice && !recruiterNotice) {
        throw new Error("notification recipient is invalid");
      }
      const exists = notifications.some((item) =>
        item.requestId === row.requestId && item.recipientUserId === row.recipientUserId && item.kind === row.kind);
      if (exists) return "duplicate";
      notifications.push(row);
      return "created";
    },
    async listNotifications(recipientUserId) {
      return notifications.filter((row) => row.recipientUserId === recipientUserId);
    },
    async markRead(id, recipientUserId) {
      const row = notifications.find((item) => item.id === id && item.recipientUserId === recipientUserId);
      if (!row) return null;
      row.readAt = row.readAt ?? new Date().toISOString();
      return row;
    },
  };
}

function githubThreshold(row: VerificationRequestRecord): number | null {
  if (row.threshold === 50 || row.threshold === 100 || row.threshold === 150) return row.threshold;
  const match = /^At least (50|100|150) unique commits/.exec(row.policyLabel);
  return match ? Number(match[1]) : null;
}

function openEnough(status: VerificationStatus): boolean {
  return status === "pending" || status === "approved" || status === "generating";
}

export class VerificationNotificationWorkflow {
  constructor(
    private readonly directory: VerificationDirectory,
    private readonly now: () => number = Date.now,
  ) {}

  async recordPracticalRequest(input: {
    legacyScoreRequestId: string;
    recruiterUserId: string;
    learnerUserId: string;
    recruiterLabel: string;
    learnerLabel: string;
    skillLabel: string;
    threshold: number;
    expiresAt: string;
  }): Promise<VerificationRequestRecord> {
    const existing = await this.directory.findByLegacy(input.legacyScoreRequestId);
    if (existing) return existing;
    const request: VerificationRequestRecord = {
      id: randomUUID(),
      legacyScoreRequestId: input.legacyScoreRequestId,
      recruiterUserId: input.recruiterUserId,
      learnerUserId: input.learnerUserId,
      recruiterLabel: input.recruiterLabel,
      learnerLabel: input.learnerLabel,
      category: "practical-score",
      skillLabel: input.skillLabel,
      policyLabel: `At least ${input.threshold}%`,
      threshold: input.threshold,
      status: "pending",
      expiresAt: input.expiresAt,
      createdAt: new Date(this.now()).toISOString(),
    };
    await this.directory.insertRequest(request);
    const copy = practicalRequestCopy(input);
    await this.directory.insertNotification({
      id: randomUUID(),
      recipientUserId: input.learnerUserId,
      requestId: request.id,
      audience: "learner",
      kind: "request_created",
      title: copy.title,
      body: copy.body,
      readAt: null,
      createdAt: request.createdAt,
    });
    return request;
  }

  async recordGithubActivityRequest(input: {
    recruiterUserId: string;
    learnerUserId: string;
    recruiterLabel: string;
    learnerLabel: string;
    threshold: number;
    expiresAt: string;
  }): Promise<VerificationRequestRecord> {
    if (!GITHUB_ACTIVITY_THRESHOLDS.includes(input.threshold as 50 | 100 | 150)) {
      throw new AppError("GitHub activity requests only allow thresholds of 50, 100, or 150.", 400);
    }
    if (input.recruiterUserId === input.learnerUserId) {
      throw new AppError("Verification request not found", 404);
    }
    const open = (await this.directory.listForRecruiter(input.recruiterUserId)).find((row) =>
      row.category === "github-activity"
      && row.learnerUserId === input.learnerUserId
      && githubThreshold(row) === input.threshold
      && openEnough(row.status)
      && Date.parse(row.expiresAt) > this.now(),
    );
    if (open) return { ...open, threshold: input.threshold };
    const request: VerificationRequestRecord = {
      id: randomUUID(),
      legacyScoreRequestId: null,
      recruiterUserId: input.recruiterUserId,
      learnerUserId: input.learnerUserId,
      recruiterLabel: input.recruiterLabel,
      learnerLabel: input.learnerLabel,
      category: "github-activity",
      skillLabel: "GitHub activity",
      policyLabel: `At least ${input.threshold} unique commits authored by the connected GitHub account`,
      threshold: input.threshold,
      status: "pending",
      expiresAt: input.expiresAt,
      createdAt: new Date(this.now()).toISOString(),
    };
    try {
      await this.directory.insertRequest(request);
    } catch (err) {
      if (isMissingColumnError(err)) {
        await this.directory.insertRequest({ ...request, threshold: null });
      } else if (isUniqueViolation(err)) {
        const winner = (await this.directory.listForRecruiter(input.recruiterUserId)).find((row) =>
          row.category === "github-activity"
          && row.learnerUserId === input.learnerUserId
          && githubThreshold(row) === input.threshold
          && openEnough(row.status),
        );
        if (winner) return { ...winner, threshold: input.threshold };
        throw err;
      } else {
        throw err;
      }
    }
    const copy = githubActivityRequestCopy(input.threshold);
    await this.directory.insertNotification({
      id: randomUUID(),
      recipientUserId: input.learnerUserId,
      requestId: request.id,
      audience: "learner",
      kind: "request_created",
      title: copy.title,
      body: copy.body,
      readAt: null,
      createdAt: request.createdAt,
    });
    return request;
  }

  async completeGithubActivity(
    requestId: string,
    learnerUserId: string,
    outcome: "verified" | "unsatisfied" | "failed",
    repositoryFullName: string,
  ): Promise<VerificationRequestRecord> {
    const request = await this.requireLearner(requestId, learnerUserId);
    if (request.category !== "github-activity") throw new AppError("Verification request not found", 404);
    if (request.status !== "approved" && request.status !== "generating") {
      throw new AppError("This request can no longer be completed.", 409);
    }
    const next = await this.directory.claimStatus(request.id, ["approved", "generating"], outcome);
    if (!next) throw new AppError("This request can no longer be completed.", 409);
    next.skillLabel = repositoryFullName;
    const kind = outcome === "verified" ? "verified" : "failed";
    const copy = outcome === "unsatisfied"
      ? {
        title: "GitHub threshold not satisfied",
        body: "The connected GitHub account does not meet the requested commit threshold. The exact count was not revealed.",
      }
      : outcome === "failed"
        ? {
          title: "GitHub verification unavailable",
          body: "The GitHub proof could not be completed. This is not a result about the commit count.",
        }
        : {
          title: "GitHub activity verified",
          body: `${request.learnerLabel}'s connected GitHub account meets the requested commit threshold in ${repositoryFullName}. The exact count was not revealed.`,
        };
    await this.directory.insertNotification({
      id: randomUUID(),
      recipientUserId: request.recruiterUserId,
      requestId: request.id,
      audience: "recruiter",
      kind,
      title: copy.title,
      body: copy.body,
      readAt: null,
      createdAt: new Date(this.now()).toISOString(),
    });
    return next;
  }

  async approve(requestId: string, learnerUserId: string): Promise<VerificationRequestRecord> {
    const request = await this.currentForLearner(requestId, learnerUserId);
    if (request.status !== "pending") {
      throw new AppError("This request can no longer be approved.", 409);
    }
    const next = await this.directory.updateStatus(request.id, "approved");
    if (!next) throw new AppError("Verification request not found", 404);
    await this.notifyRecruiter(next, "approved");
    return next;
  }

  async reject(requestId: string, learnerUserId: string): Promise<VerificationRequestRecord> {
    const request = await this.currentForLearner(requestId, learnerUserId);
    if (request.status === "rejected") return request;
    if (request.status !== "pending" && request.status !== "approved" && request.status !== "generating") {
      throw new AppError("This request can no longer be declined.", 409);
    }
    const next = await this.directory.updateStatus(request.id, "rejected");
    if (!next) throw new AppError("Verification request not found", 404);
    await this.notifyRecruiter(next, "rejected");
    return next;
  }

  async markRequestGenerating(requestId: string, learnerUserId: string): Promise<void> {
    const request = await this.requireLearner(requestId, learnerUserId);
    const claimed = await this.directory.claimStatus(request.id, ["approved"], "generating");
    if (!claimed) throw new AppError("This request can no longer be completed.", 409);
  }

  async markGenerating(legacyScoreRequestId: string): Promise<void> {
    const request = await this.directory.findByLegacy(legacyScoreRequestId);
    if (!request || (request.status !== "pending" && request.status !== "approved")) return;
    await this.directory.updateStatus(request.id, "generating");
  }

  async applyLegacyOutcome(input: {
    legacyScoreRequestId: string;
    legacyStatus: "open" | "declined" | "consumed" | "expired";
    accepted: boolean | null;
  }): Promise<void> {
    const request = await this.directory.findByLegacy(input.legacyScoreRequestId);
    if (!request) return;
    if (input.legacyStatus === "declined") {
      await this.finish(request, "rejected");
      return;
    }
    if (input.legacyStatus === "expired") {
      await this.markExpired(request);
      return;
    }
    if (input.legacyStatus === "consumed" && input.accepted === true) {
      await this.finish(request, "verified");
      return;
    }
    if (input.legacyStatus === "consumed" && input.accepted === false) {
      await this.finish(request, "failed");
      return;
    }
    if (input.accepted === false) {
      await this.notifyRecruiter(request, "failed");
    }
    if (request.status === "generating" || request.status === "failed") {
      const notes = await this.directory.listNotifications(request.recruiterUserId);
      const approved = notes.some((item) => item.requestId === request.id && item.kind === "approved");
      await this.directory.updateStatus(request.id, approved ? "approved" : "pending");
    }
  }

  async markVerified(legacyScoreRequestId: string): Promise<void> {
    await this.applyLegacyOutcome({
      legacyScoreRequestId,
      legacyStatus: "consumed",
      accepted: true,
    });
  }

  async markExpired(request: VerificationRequestRecord): Promise<VerificationRequestRecord> {
    if (request.status === "expired") return request;
    const next = await this.directory.updateStatus(request.id, "expired");
    if (!next) return request;
    await this.notifyRecruiter(next, "expired");
    return next;
  }

  async listForLearner(learnerUserId: string): Promise<VerificationRequestRecord[]> {
    const rows = await this.directory.listForLearner(learnerUserId);
    return Promise.all(rows.map((row) => this.expireIfNeeded(row)));
  }

  async listForRecruiter(recruiterUserId: string): Promise<VerificationRequestRecord[]> {
    const rows = await this.directory.listForRecruiter(recruiterUserId);
    return Promise.all(rows.map((row) => this.expireIfNeeded(row)));
  }

  async listNotifications(recipientUserId: string): Promise<VerificationNotificationRecord[]> {
    return this.directory.listNotifications(recipientUserId);
  }

  private async expireIfNeeded(request: VerificationRequestRecord): Promise<VerificationRequestRecord> {
    if (!openEnough(request.status)) return request;
    if (Date.parse(request.expiresAt) > this.now()) return request;
    return this.markExpired(request);
  }

  private async currentForLearner(requestId: string, learnerUserId: string): Promise<VerificationRequestRecord> {
    const request = await this.requireLearner(requestId, learnerUserId);
    if (Date.parse(request.expiresAt) <= this.now() && (request.status === "pending" || request.status === "approved" || request.status === "generating")) {
      await this.markExpired(request);
      throw new AppError("This request has expired.", 409);
    }
    return request;
  }

  private async requireLearner(requestId: string, learnerUserId: string): Promise<VerificationRequestRecord> {
    const request = await this.directory.findById(requestId);
    if (!request || request.learnerUserId !== learnerUserId) {
      throw new AppError("Verification request not found", 404);
    }
    return request;
  }

  private async finish(request: VerificationRequestRecord, status: "rejected" | "verified" | "failed"): Promise<void> {
    if (request.status === status) return;
    const next = await this.directory.updateStatus(request.id, status);
    if (next) await this.notifyRecruiter(next, status);
  }

  private async notifyRecruiter(request: VerificationRequestRecord, kind: Exclude<NotificationKind, "request_created">): Promise<void> {
    const copy = recruiterResultCopy(kind, request.learnerLabel);
    await this.directory.insertNotification({
      id: randomUUID(),
      recipientUserId: request.recruiterUserId,
      requestId: request.id,
      audience: "recruiter",
      kind,
      title: copy.title,
      body: copy.body,
      readAt: null,
      createdAt: new Date(this.now()).toISOString(),
    });
  }
}
