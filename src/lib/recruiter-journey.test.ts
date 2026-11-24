import { describe, expect, it } from "vitest";
import { buildSkillJourneyTimeline, competencyJourney, summarizeSkillJourney } from "./recruiter-journey";

describe("competency journey", () => {
  it("keeps one disclosed credential as a single version", () => {
    const versions = competencyJourney([
      { id: "cred-1", skill: "TypeScript", issuedAt: "2026-01-01T00:00:00.000Z", issuer: "Capital University", status: "Shared" },
    ], "TypeScript");
    expect(versions).toHaveLength(1);
    expect(versions[0].issuer).toBe("Capital University");
  });

  it("orders only the credentials shared for that skill", () => {
    const versions = competencyJourney([
      { id: "later", skill: "TypeScript", issuedAt: "2026-06-01T00:00:00.000Z" },
      { id: "other", skill: "SQL", issuedAt: "2026-03-01T00:00:00.000Z" },
      { id: "earlier", skill: "typescript", issuedAt: "2026-01-01T00:00:00.000Z" },
    ], "TypeScript");
    expect(versions.map((version) => version.id)).toEqual(["earlier", "later"]);
  });
});

describe("buildSkillJourneyTimeline", () => {
  it("builds a chronological timeline from shared credentials and assessments", () => {
    const timeline = buildSkillJourneyTimeline({
      skill: "TypeScript",
      credentials: [
        {
          id: "cred-1",
          skill: "TypeScript",
          issuedAt: "2026-03-01T00:00:00.000Z",
          issuer: "Capital University",
          status: "Shared",
        },
      ],
      recordedVersions: [
        {
          id: "ver-1",
          skillName: "TypeScript",
          versionNumber: 1,
          status: "issued",
          anchorStatus: "confirmed",
          createdAt: "2026-04-01T00:00:00.000Z",
          credentialId: "cred-1",
          hasCredential: true,
        },
      ],
      disclosedPayload: {
        evidence: {
          practicalTask: {
            latestAttempt: {
              attemptId: "attempt-1",
              title: "TypeScript kata",
              submittedAt: "2026-02-15T00:00:00.000Z",
              passed: true,
              scorePercent: 88,
              status: "Passed",
            },
          },
        },
      },
    });

    expect(timeline.map((item) => item.kind)).toEqual(["assessment", "credential", "version"]);
    expect(timeline[0].title).toContain("Attempt 1 of 1");
    expect(timeline[0].scoreLabel).toBe("88%");
    expect(timeline[0].verification).toBe("Shared");
    expect(timeline[0].detail).not.toMatch(/pass|fail/i);
    expect(timeline[2].verification).toBe("Verified");
  });

  it("lists every practical retry with score and timing", () => {
    const timeline = buildSkillJourneyTimeline({
      skill: "TypeScript",
      credentials: [],
      sharedAt: "2026-06-01T12:00:00.000Z",
      disclosedPayload: {
        evidence: {
          practicalTask: {
            taskTitle: "API kata",
            attemptHistory: [
              {
                attemptId: "a1",
                title: "API kata",
                submittedAt: "2026-01-10T09:15:00.000Z",
                passed: false,
                scorePercent: 55,
                correctCount: 5,
                totalQuestions: 10,
                status: "Needs Improvement",
              },
              {
                attemptId: "a2",
                title: "API kata",
                submittedAt: "2026-01-12T14:30:00.000Z",
                passed: true,
                scorePercent: 90,
                correctCount: 9,
                totalQuestions: 10,
                status: "Passed",
              },
            ],
          },
          github: {
            repos: [{ id: "repo-1", full_name: "me/api", createdAt: "2026-01-05T08:00:00.000Z" }],
          },
          institutionReview: {
            status: "Approved",
            feedback: "Strong progress",
            reviewedAt: "2026-01-20T11:00:00.000Z",
          },
        },
      },
    });

    const assessments = timeline.filter((item) => item.kind === "assessment");
    expect(assessments).toHaveLength(2);
    expect(assessments[0].detail).toContain("First attempt");
    expect(assessments[0].scoreLabel).toBe("55% (5/10)");
    expect(assessments[1].detail).toContain("Retry 1");
    expect(assessments[1].scoreLabel).toBe("90% (9/10)");
    expect(timeline.some((item) => item.kind === "integration" && item.title.includes("me/api"))).toBe(true);
    expect(timeline.some((item) => item.title === "Institution review")).toBe(true);

    const summary = summarizeSkillJourney(timeline);
    expect(summary.attemptCount).toBe(2);
    expect(summary.bestScoreLabel).toBe("90% (9/10)");
  });

  it("ignores milestones for other skills and undated evidence", () => {
    const timeline = buildSkillJourneyTimeline({
      skill: "TypeScript",
      credentials: [
        { id: "sql", skill: "SQL", issuedAt: "2026-01-01T00:00:00.000Z" },
      ],
      recordedVersions: [
        {
          id: "ver-sql",
          skillName: "SQL",
          versionNumber: 1,
          status: "issued",
          anchorStatus: "unavailable",
          createdAt: "2026-01-02T00:00:00.000Z",
          credentialId: null,
          hasCredential: false,
        },
      ],
      disclosedPayload: {
        evidence: {
          lms: {
            courses: [{ id: "course-1", courseName: "Intro TS" }],
          },
        },
      },
    });

    expect(timeline).toHaveLength(0);
  });

  it("uses sharedAt so undated evidence and a baseline share still appear", () => {
    const timeline = buildSkillJourneyTimeline({
      skill: "TypeScript",
      credentials: [],
      sharedAt: "2026-05-01T00:00:00.000Z",
      disclosedPayload: {
        evidence: {
          lms: {
            courses: [{ id: "course-1", courseName: "Intro TS" }],
          },
        },
      },
    });

    expect(timeline.map((item) => item.kind)).toEqual(["credential", "achievement"]);
    expect(timeline[0].title).toBe("Competency shared");
    expect(timeline[1].date).toBe("2026-05-01T00:00:00.000Z");
  });
});
