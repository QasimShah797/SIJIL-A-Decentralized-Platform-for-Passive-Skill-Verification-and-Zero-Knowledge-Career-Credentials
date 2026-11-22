import { describe, expect, it } from "vitest";
import {
  assessEvidenceShareAvailability,
  defaultEvidenceModesForAvailability,
} from "./evidence-share-availability";

describe("evidence-share-availability", () => {
  it("hides Moodle and Peer for Typescript-like packages", () => {
    const avail = assessEvidenceShareAvailability({
      practicalTask: {
        latestAttempt: { status: "Passed", passed: true, scorePercent: 88 },
      },
      github: { repos: [{ full_name: "a/b" }], activities: [], reviews: [] },
      lms: { courses: [], assignments: [], evidence: [] },
      peerReviews: [],
    });
    expect(avail.lms_evidence.present).toBe(false);
    expect(avail.peer_reviews.present).toBe(false);
    expect(avail.github_evidence.present).toBe(true);
    expect(avail.practical_task_result.present).toBe(true);
    const modes = defaultEvidenceModesForAvailability(avail);
    expect(modes.lms_evidence).toBe("omit");
    expect(modes.peer_reviews).toBe("omit");
    expect(modes.github_evidence).toBe("omit");
    expect(modes.practical_task_result).toBe("omit");
  });

  it("enables Moodle private for Java with assignments", () => {
    const avail = assessEvidenceShareAvailability({
      lms: {
        courses: [{ fullname: "Java" }],
        assignments: [{ name: "ATM", submission_status: "Graded" }],
      },
    });
    expect(avail.lms_evidence.present).toBe(true);
    expect(avail.lms_evidence.privateAllowed).toBe(true);
  });

  it("isolates cross-skill evidence by package contents only", () => {
    const avail = assessEvidenceShareAvailability({
      lms: { courses: [], assignments: [] },
      github: { repos: [] },
      peerReviews: [],
      practicalTask: { latestAttempt: null, attemptHistory: [] },
    });
    expect(Object.values(avail).every((item) => item.present === false)).toBe(true);
  });
});
