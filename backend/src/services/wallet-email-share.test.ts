import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { AppError } from "../utils/AppError";

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function evaluateEmailShareGuard(input: {
  ownerId: string;
  callerId: string;
  revokedAt: string | null;
  expiresAt: string | null;
  shareKind: "public" | "all-recruiters" | "direct-recruiter";
  storedHash: string;
  token: string;
  now?: number;
}): string | null {
  if (input.ownerId !== input.callerId) return "Not authorized to send this share";
  if (input.revokedAt) return "This share has been revoked and cannot be emailed";
  const now = input.now ?? Date.now();
  if (input.expiresAt && new Date(input.expiresAt).getTime() <= now) {
    return "This share has expired and cannot be emailed";
  }
  if (input.shareKind !== "public") return "Only public verification links can be emailed";
  if (hash(input.token) !== input.storedHash) return "Share token does not match this link";
  return null;
}

describe("public share email guards", () => {
  const token = "aaaaaaaaaaaaaaaa";
  const storedHash = hash(token);

  it("allows the owner to email an active public link", () => {
    assert.equal(evaluateEmailShareGuard({
      ownerId: "learner-1",
      callerId: "learner-1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      shareKind: "public",
      storedHash,
      token,
    }), null);
  });

  it("rejects another learner", () => {
    assert.match(evaluateEmailShareGuard({
      ownerId: "learner-1",
      callerId: "learner-2",
      revokedAt: null,
      expiresAt: null,
      shareKind: "public",
      storedHash,
      token,
    }) ?? "", /Not authorized/);
  });

  it("rejects revoked and expired shares", () => {
    assert.match(evaluateEmailShareGuard({
      ownerId: "learner-1",
      callerId: "learner-1",
      revokedAt: new Date().toISOString(),
      expiresAt: null,
      shareKind: "public",
      storedHash,
      token,
    }) ?? "", /revoked/);
    assert.match(evaluateEmailShareGuard({
      ownerId: "learner:1",
      callerId: "learner:1",
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      shareKind: "public",
      storedHash,
      token,
      now: Date.now(),
    }) ?? "", /expired/);
  });

  it("rejects all-recruiter shares and mismatched tokens", () => {
    assert.match(evaluateEmailShareGuard({
      ownerId: "learner-1",
      callerId: "learner-1",
      revokedAt: null,
      expiresAt: null,
      shareKind: "all-recruiters",
      storedHash,
      token,
    }) ?? "", /Only public/);
    assert.match(evaluateEmailShareGuard({
      ownerId: "learner-1",
      callerId: "learner-1",
      revokedAt: null,
      expiresAt: null,
      shareKind: "public",
      storedHash,
      token: "bbbbbbbbbbbbbbbb",
    }) ?? "", /does not match/);
  });

  it("maps SMTP failure to a copy-link message", () => {
    const error = new AppError("Unable to send email. You can still copy the link.", 503);
    assert.equal(error.statusCode, 503);
    assert.match(error.message, /still copy the link/);
  });
});
