/**
 * Learner wallet history must survive the column grant that hides answer_key.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LEARNER_MCQ_ATTEMPT_COLUMNS, buildAttemptHistoryItem } from "./wallet.service";

const REVOKED_FROM_AUTHENTICATED = ["answer_key", "user_id", "type", "updated_at"];

describe("learner wallet assessment history", () => {
  it("asks the learner session only for columns the commitment migration grants", () => {
    const selected = new Set<string>(LEARNER_MCQ_ATTEMPT_COLUMNS);
    for (const column of REVOKED_FROM_AUTHENTICATED) {
      assert.equal(selected.has(column), false, column);
    }
    for (const column of ["status", "percentage", "correct_count", "total_questions", "passed", "submitted_at"]) {
      assert.equal(selected.has(column), true, column);
    }
  });

  it("shows a completed assessment when the answer key is inaccessible", () => {
    const history = buildAttemptHistoryItem({
      id: "44444444-4444-4444-8444-444444444444",
      title: "Circuits",
      status: "completed",
      percentage: 73,
      correct_count: 8,
      total_questions: 10,
      passed: true,
      submitted_at: "2026-10-17T00:00:00.000Z",
      created_at: "2026-10-16T00:00:00.000Z",
    });
    assert.ok(history);
    assert.equal(history.status, "Passed");
    assert.equal(history.passed, true);
    assert.equal(history.scorePercent, 73);
    assert.equal(history.correctCount, 8);
    assert.equal(history.totalQuestions, 10);
    assert.equal(history.submittedAt, "2026-10-17T00:00:00.000Z");
    assert.equal(JSON.stringify(history).includes("answer_key"), false);
    assert.equal(JSON.stringify(history).includes("correctOptionId"), false);
  });

  it("does not recover a score from an answer key when the trusted columns are absent", () => {
    const history = buildAttemptHistoryItem({
      id: "55555555-5555-4555-8555-555555555555",
      title: "Older attempt",
      status: "completed",
      passed: false,
      answer_key: [{ id: "q1", correctOptionId: "A" }],
      learner_answers: ["A"],
      submitted_at: "2026-10-01T00:00:00.000Z",
    });
    assert.ok(history);
    assert.equal(history.scorePercent, null);
    assert.equal(history.correctCount, null);
    assert.equal(history.totalQuestions, null);
    assert.equal(history.passed, false);
    assert.equal(JSON.stringify(history).includes("correctOptionId"), false);
  });
});
