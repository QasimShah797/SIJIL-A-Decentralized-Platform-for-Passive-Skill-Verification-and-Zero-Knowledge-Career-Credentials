import { describe, expect, it } from "vitest";
import { scoreClosedAssessment } from "./assessment-scoring";

describe("scoreClosedAssessment", () => {
  it("scores a legacy single-choice key", () => {
    const result = scoreClosedAssessment(
      [{ id: "q1", correctOptionId: "B" }, { id: "q2", correctOptionId: "A" }],
      { q1: "B", q2: "C" },
    );
    expect(result).toEqual({ correctCount: 1, totalQuestions: 2, percentage: 50, passed: true });
  });

  it("scores multiple-response by exact set", () => {
    const key = [{ id: "m1", type: "multi", correctOptionIds: ["A", "C"] }];
    expect(scoreClosedAssessment(key, { m1: ["C", "A"] }).correctCount).toBe(1);
    expect(scoreClosedAssessment(key, { m1: ["A"] }).correctCount).toBe(0);
    expect(scoreClosedAssessment(key, { m1: ["A", "C", "D"] }).correctCount).toBe(0);
  });

  it("scores ordering and matching exactly", () => {
    const key = [
      { id: "o1", type: "order", correctOrder: ["b", "a", "c"] },
      { id: "p1", type: "match", correctMatches: { left1: "right2", left2: "right1" } },
    ];
    const perfect = scoreClosedAssessment(key, {
      o1: ["b", "a", "c"],
      p1: { left1: "right2", left2: "right1" },
    });
    expect(perfect.correctCount).toBe(2);
    expect(perfect.passed).toBe(true);

    const swapped = scoreClosedAssessment(key, {
      o1: ["a", "b", "c"],
      p1: { left1: "right2" },
    });
    expect(swapped.correctCount).toBe(0);
  });

  it("does not treat a missing answer as correct", () => {
    const result = scoreClosedAssessment(
      [{ id: "h1", type: "hotspot", correctOptionId: "C" }],
      {},
    );
    expect(result.correctCount).toBe(0);
    expect(result.percentage).toBe(0);
    expect(result.passed).toBe(true);
  });
});
