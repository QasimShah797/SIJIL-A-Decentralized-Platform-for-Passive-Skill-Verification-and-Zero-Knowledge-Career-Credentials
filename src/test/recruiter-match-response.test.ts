import { describe, expect, it, beforeEach } from "vitest";
import {
  allowMatchRequest,
  recruiterAccess,
  resetMatchRateLimit,
  sanitizeQuestion,
  validateRecruiterMatchAnswer,
} from "@/lib/recruiter-match-response";

describe("recruiter match contract", () => {
  beforeEach(() => resetMatchRateLimit());

  it("limits the question to 500 characters", () => {
    expect(sanitizeQuestion(`  ${"a".repeat(600)}  `)).toHaveLength(500);
    expect(sanitizeQuestion(12)).toBe("");
  });

  it("allows recruiters and admins only", () => {
    expect(recruiterAccess({ authenticated: false, roles: ["recruiter"] })).toBe(401);
    expect(recruiterAccess({ authenticated: true, roles: null, roleLookupFailed: true })).toBe(403);
    expect(recruiterAccess({ authenticated: true, roles: ["learner"] })).toBe(403);
    expect(recruiterAccess({ authenticated: true, roles: ["recruiter"] })).toBe(200);
    expect(recruiterAccess({ authenticated: true, roles: ["admin"] })).toBe(200);
  });

  it("drops candidate ids that were not in the disclosed context", () => {
    const answer = validateRecruiterMatchAnswer({
      intent: "rank",
      headline: "One shared learner matches Java.",
      candidates: [
        { id: "kept", rank: 1, verdict: "Has Java.", strengths: ["Java"], gaps: [], basis: { credentials: 1, evidence: 2, verifiedEvidence: 1 } },
        { id: "invented", rank: 2, verdict: "Should not appear.", strengths: [], gaps: [], basis: { credentials: 9, evidence: 9, verifiedEvidence: 9 } },
      ],
      comparison: {
        skills: ["Java"],
        rows: [
          { candidateId: "kept", cells: [{ skill: "Java", evidenceCount: 2, verified: true }] },
          { candidateId: "invented", cells: [{ skill: "Java", evidenceCount: 9, verified: true }] },
        ],
      },
      notDisclosed: ["salary"],
      followUps: ["Who has more verified evidence?"],
    }, ["kept"]);
    expect(answer?.candidates.map((item) => item.id)).toEqual(["kept"]);
    expect(answer?.comparison?.rows.map((row) => row.candidateId)).toEqual(["kept"]);
  });

  it("rejects a response without a headline", () => {
    expect(validateRecruiterMatchAnswer({ intent: "find", candidates: [] }, ["a"])).toBeNull();
  });

  it("allows 20 questions a minute and then blocks", () => {
    for (let i = 0; i < 20; i += 1) expect(allowMatchRequest("user-1", 1_000)).toBe(true);
    expect(allowMatchRequest("user-1", 1_000)).toBe(false);
    expect(allowMatchRequest("user-1", 61_001)).toBe(true);
  });
});
