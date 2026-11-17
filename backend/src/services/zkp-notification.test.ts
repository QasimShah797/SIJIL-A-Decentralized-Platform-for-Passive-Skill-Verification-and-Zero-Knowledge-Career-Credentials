import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AppError } from "../utils/AppError";
import {
  VerificationNotificationWorkflow,
  createMemoryVerificationDirectory,
  practicalRequestCopy,
} from "./zkp-notification";

const NOW = Date.parse("2026-11-15T12:00:00.000Z");

function workflow(now = NOW) {
  const directory = createMemoryVerificationDirectory();
  return {
    directory,
    flow: new VerificationNotificationWorkflow(directory, () => now),
  };
}

const requestInput = {
  legacyScoreRequestId: "score-1",
  recruiterUserId: "recruiter-1",
  learnerUserId: "learner-1",
  recruiterLabel: "CUST",
  learnerLabel: "Horain",
  skillLabel: "TypeScript",
  threshold: 70,
  expiresAt: "2026-11-16T12:00:00.000Z",
};

describe("verification notifications", () => {
  it("creates one learner notification for a recruiter request", async () => {
    const { flow } = workflow();
    const request = await flow.recordPracticalRequest(requestInput);
    const again = await flow.recordPracticalRequest(requestInput);
    const notes = await flow.listNotifications("learner-1");
    assert.equal(request.id, again.id);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].title, "New verification request");
    assert.match(notes[0].body, /TypeScript/);
    assert.match(notes[0].body, /minimum threshold of 70%/);
    assert.match(notes[0].body, /open your Wallet/);
    assert.equal(/approve|reject|generate|submit/i.test(notes[0].body), false);
    assert.equal(notes[0].body.includes("blinding"), false);
    assert.equal(notes[0].body.includes("witness"), false);
  });

  it("keeps the notification after a new read of the same directory", async () => {
    const directory = createMemoryVerificationDirectory();
    const first = new VerificationNotificationWorkflow(directory, () => NOW);
    await first.recordPracticalRequest(requestInput);
    const second = new VerificationNotificationWorkflow(directory, () => NOW);
    const notes = await second.listNotifications("learner-1");
    assert.equal(notes.length, 1);
    assert.equal(notes[0].readAt, null);
  });

  it("lets the learner approve and tells only the recruiter", async () => {
    const { flow } = workflow();
    const request = await flow.recordPracticalRequest(requestInput);
    const approved = await flow.approve(request.id, "learner-1");
    assert.equal(approved.status, "approved");
    const recruiter = await flow.listNotifications("recruiter-1");
    assert.equal(recruiter.length, 1);
    assert.match(recruiter[0].body, /Horain approved/);
    assert.equal((await flow.listNotifications("learner-1")).length, 1);
  });

  it("lets the learner reject and tells the recruiter", async () => {
    const { flow } = workflow();
    const request = await flow.recordPracticalRequest(requestInput);
    const rejected = await flow.reject(request.id, "learner-1");
    assert.equal(rejected.status, "rejected");
    const recruiter = await flow.listNotifications("recruiter-1");
    assert.match(recruiter[0].body, /declined/);
  });

  it("does not approve an expired request and notifies the recruiter once", async () => {
    const { flow } = workflow(Date.parse("2026-11-17T12:00:00.000Z"));
    const request = await flow.recordPracticalRequest(requestInput);
    await assert.rejects(() => flow.approve(request.id, "learner-1"), (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 409);
      return true;
    });
    const listed = await flow.listForLearner("learner-1");
    assert.equal(listed[0].status, "expired");
    const recruiter = await flow.listNotifications("recruiter-1");
    assert.equal(recruiter.filter((item) => item.kind === "expired").length, 1);
  });

  it("hides another learner's request", async () => {
    const { flow } = workflow();
    const request = await flow.recordPracticalRequest(requestInput);
    await assert.rejects(() => flow.approve(request.id, "learner-2"), (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 404);
      return true;
    });
    assert.equal((await flow.listNotifications("learner-2")).length, 0);
  });

  it("notifies the recruiter when the proof is verified, without a second notice", async () => {
    const { flow } = workflow();
    await flow.recordPracticalRequest(requestInput);
    await flow.markVerified("score-1");
    await flow.markVerified("score-1");
    const recruiter = await flow.listNotifications("recruiter-1");
    assert.equal(recruiter.filter((item) => item.kind === "verified").length, 1);
    assert.match(recruiter[0].body, /not revealed/);
  });

  it("does not put notification routes on the public presentation router", () => {
    const sql = readFileSync(resolve(process.cwd(), "../supabase/migrations/20261115220000_zkp_verification_notifications.sql"), "utf8");
    const publicRoutes = readFileSync(resolve(process.cwd(), "src/routes/public-presentations.routes.ts"), "utf8");
    assert.match(sql, /zkp_notifications_once/);
    assert.match(sql, /REVOKE ALL ON public.zkp_notifications FROM anon, authenticated/);
    assert.equal(publicRoutes.includes("verification-requests"), false);
    assert.equal(publicRoutes.includes("zkp/notifications"), false);
    const copy = practicalRequestCopy({ recruiterLabel: "CUST", skillLabel: "TypeScript", threshold: 70 });
    assert.equal(copy.body.includes("blinding"), false);
    assert.match(sql, /zkp_notifications_guard/);
    assert.match(sql, /notification content is immutable/);
    assert.match(sql, /learner notification recipient is invalid/);
    assert.match(sql, /REPLICA IDENTITY FULL/);
    assert.equal(/GRANT UPDATE ON public.zkp_notifications TO authenticated/.test(sql), false);
  });

  it("rejects a learner notification addressed to the recruiter", async () => {
    const { directory, flow } = workflow();
    const request = await flow.recordPracticalRequest(requestInput);
    await assert.rejects(() => directory.insertNotification({
      id: "note-bad",
      recipientUserId: "recruiter-1",
      requestId: request.id,
      audience: "learner",
      kind: "request_created",
      title: "New verification request",
      body: "Wrong recipient",
      readAt: null,
      createdAt: "2026-11-15T12:00:00.000Z",
    }));
  });

  it("marks only the recipient read and leaves the message unchanged", async () => {
    const { directory, flow } = workflow();
    const request = await flow.recordPracticalRequest(requestInput);
    const note = (await flow.listNotifications("learner-1"))[0];
    assert.equal(await directory.markRead(note.id, "recruiter-1"), null);
    const read = await directory.markRead(note.id, "learner-1");
    assert.equal(read?.body, note.body);
    assert.equal(read?.title, note.title);
    assert.ok(read?.readAt);
  });

  it("returns a failed proof to approved without a second failure notice", async () => {
    const { flow } = workflow();
    const request = await flow.recordPracticalRequest(requestInput);
    await flow.approve(request.id, "learner-1");
    await flow.markGenerating("score-1");
    await flow.applyLegacyOutcome({ legacyScoreRequestId: "score-1", legacyStatus: "open", accepted: false });
    await flow.applyLegacyOutcome({ legacyScoreRequestId: "score-1", legacyStatus: "open", accepted: false });
    const listed = await flow.listForLearner("learner-1");
    assert.equal(listed[0].status, "approved");
    const recruiter = await flow.listNotifications("recruiter-1");
    assert.equal(recruiter.filter((item) => item.kind === "failed").length, 1);
    assert.equal(recruiter.some((item) => item.body.includes("blinding")), false);
  });

  it("stores a GitHub activity request without a commit count and rejects 70", async () => {
    const { flow } = workflow();
    await assert.rejects(() => flow.recordGithubActivityRequest({
      recruiterUserId: "recruiter-1",
      learnerUserId: "learner-1",
      recruiterLabel: "CUST",
      learnerLabel: "Horain",
      threshold: 70,
      expiresAt: "2026-11-16T12:00:00.000Z",
    }), (err: unknown) => err instanceof AppError && err.statusCode === 400);
    const request = await flow.recordGithubActivityRequest({
      recruiterUserId: "recruiter-1",
      learnerUserId: "learner-1",
      recruiterLabel: "CUST",
      learnerLabel: "Horain",
      threshold: 100,
      expiresAt: "2026-11-16T12:00:00.000Z",
    });
    const note = (await flow.listNotifications("learner-1")).at(-1);
    assert.equal(request.threshold, 100);
    assert.equal(request.category, "github-activity");
    const again = await flow.recordGithubActivityRequest({
      recruiterUserId: "recruiter-1",
      learnerUserId: "learner-1",
      recruiterLabel: "CUST",
      learnerLabel: "Horain",
      threshold: 100,
      expiresAt: "2026-11-16T12:00:00.000Z",
    });
    assert.equal(again.id, request.id);
    assert.equal((await flow.listNotifications("learner-1")).filter((item) => item.requestId === request.id).length, 1);
    assert.equal((await flow.listForLearner("learner-2")).length, 0);
    assert.match(note?.body ?? "", /at least 100 unique commits/);
    assert.equal(/80|120|blinding|witness/.test(note?.body ?? ""), false);
    await assert.rejects(() => flow.completeGithubActivity(request.id, "learner-1", "verified", "org/shared"), (err: unknown) => err instanceof AppError && err.statusCode === 409);
    await assert.rejects(() => flow.approve(request.id, "learner-2"), (err: unknown) => err instanceof AppError && err.statusCode === 404);
    await flow.approve(request.id, "learner-1");
    const done = await flow.completeGithubActivity(request.id, "learner-1", "unsatisfied", "org/shared");
    assert.equal(done.status, "unsatisfied");
    const recruiter = await flow.listNotifications("recruiter-1");
    assert.match(recruiter.map((item) => item.body).join(" "), /does not meet the requested commit threshold/);
    assert.equal(recruiter.some((item) => /\b80\b|\b120\b|blinding/.test(item.body)), false);
  });

  it("follows a declined score request into rejected exactly once", async () => {
    const { flow } = workflow();
    await flow.recordPracticalRequest(requestInput);
    await flow.applyLegacyOutcome({ legacyScoreRequestId: "score-1", legacyStatus: "declined", accepted: null });
    await flow.applyLegacyOutcome({ legacyScoreRequestId: "score-1", legacyStatus: "declined", accepted: null });
    const listed = await flow.listForLearner("learner-1");
    assert.equal(listed[0].status, "rejected");
    const recruiter = await flow.listNotifications("recruiter-1");
    assert.equal(recruiter.filter((item) => item.kind === "rejected").length, 1);
  });
});
