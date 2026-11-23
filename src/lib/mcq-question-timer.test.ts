import { describe, expect, it } from "vitest";
import { moveMcqQuestionTimer, parseGenerateMcqResponse, totalMcqSeconds } from "./mcq-tasks";

describe("practical task question timer", () => {
  it("gives every question thirty seconds and preserves unused time on return", () => {
    const start = Date.parse("2026-11-24T10:00:00.000Z");
    const firstDeadline = new Date(start + 30_000).toISOString();
    const second = moveMcqQuestionTimer({}, "first", firstDeadline, "second", start + 8_000);
    expect(second.remainingByQuestion.first).toBe(22_000);
    expect(Date.parse(second.questionEndsAt) - (start + 8_000)).toBe(30_000);

    const back = moveMcqQuestionTimer(second.remainingByQuestion, "second", second.questionEndsAt, "first", start + 18_000);
    expect(Date.parse(back.questionEndsAt) - (start + 18_000)).toBe(22_000);
    expect(back.remainingByQuestion.second).toBe(20_000);

    const expired = moveMcqQuestionTimer(back.remainingByQuestion, "first", back.questionEndsAt, "second", start + 42_000);
    expect(expired.remainingByQuestion.first).toBe(0);
    expect(Date.parse(expired.questionEndsAt) - (start + 42_000)).toBe(20_000);
  });

  it("ignores shorter or longer generated question durations", () => {
    const questions = [5, 90].map((seconds) => ({
      question: "Choose one", seconds, options: [{ id: "A", text: "One" }, { id: "B", text: "Two" }],
    }));
    const task = parseGenerateMcqResponse({ attemptId: "attempt", questions });
    expect(task?.questions.map((question) => question.seconds)).toEqual([30, 30]);
    expect(totalMcqSeconds(questions)).toBe(60);
  });
});
