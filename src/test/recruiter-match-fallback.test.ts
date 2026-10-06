import { describe, expect, it } from "vitest";
import type { CandidateView } from "@/lib/db/candidates";
import { buildFallbackMatchAnswer } from "@/lib/recruiter-match-fallback";
import { displaySkill, normalizeSkill, parseMatchQuery, skillsMatch } from "@/lib/recruiter-skills";

const candidate = (id: string, extras: Partial<CandidateView>): CandidateView => ({
  id,
  name: id,
  topSkill: "—",
  evidence: 0,
  reviews: 0,
  attestation: "Pending",
  institution: "CUST",
  credentialCount: 1,
  ...extras,
});

describe("fallback match ranking", () => {
  it("ranks Aaiza's frontend skills ahead of a larger non-frontend profile", () => {
    const aaiza = candidate("a1", {
      name: "Aaiza Islam",
      credentialCount: 1,
      verifiedSkills: ["Frontend Development", "JavaScript", "Typescript", "Java"],
      skillStats: [
        { skill: "Frontend Development", verified: 4, corroborating: 0 },
        { skill: "JavaScript", verified: 2, corroborating: 0 },
        { skill: "Typescript", verified: 0, corroborating: 1 },
        { skill: "Java", verified: 0, corroborating: 5 },
      ],
      evidenceStats: { credentials: 1, verified: 6, corroborating: 1, evidenceTotal: 7, matched: { verified: 6, corroborating: 1 } },
    });
    const qasim = candidate("q1", {
      name: "Syed Qasim Ali Shah Kazmi",
      credentialCount: 12,
      verifiedSkills: ["dart", "Mobile App Development", "TypeScript", "Java"],
      skillStats: [
        { skill: "dart", verified: 0, corroborating: 20 },
        { skill: "Mobile App Development", verified: 0, corroborating: 10 },
        { skill: "TypeScript", verified: 1, corroborating: 30 },
        { skill: "Java", verified: 0, corroborating: 11 },
      ],
      evidenceStats: { credentials: 12, verified: 1, corroborating: 51, evidenceTotal: 52, matched: { verified: 1, corroborating: 0 } },
    });

    const answer = buildFallbackMatchAnswer("Who has the strongest verified frontend evidence?", [qasim, aaiza]);
    const aaizaCard = answer.candidates.find((item) => item.id === "a1");
    const qasimCard = answer.candidates.find((item) => item.id === "q1");
    expect(aaizaCard?.strengths).toEqual(expect.arrayContaining(["Frontend Development", "JavaScript", "TypeScript"]));
    expect(aaizaCard?.gaps.join(" ").toLowerCase()).not.toContain("frontend development");
    expect(aaizaCard?.verdict).toMatch(/Evidence on matched skills: 6 verified \(LMS\), 1 corroborating/);
    expect(aaizaCard?.verdict).not.toMatch(/Thin skill overlap/);
    expect(aaizaCard?.rank ?? 99).toBeLessThanOrEqual(qasimCard?.rank ?? 0);
    expect(answer.headline).toMatch(/Aaiza Islam is the strongest match for frontend/);
    expect(answer.headline).not.toMatch(/Limited evidence/);
    expect(aaizaCard?.basis).toEqual({ credentials: 1, evidence: 7, verifiedEvidence: 6 });
    expect((aaizaCard?.basis.verifiedEvidence ?? 0) + ((aaizaCard?.basis.evidence ?? 0) - (aaizaCard?.basis.verifiedEvidence ?? 0))).toBe(aaizaCard?.basis.evidence);
    expect(qasimCard?.basis.evidence).toBe(52);
    expect(qasimCard?.verdict).toMatch(/TypeScript/);
  });

  it("includes backend and database gaps for a full-stack question", () => {
    const aaiza = candidate("a1", {
      name: "Aaiza Islam",
      verifiedSkills: ["Frontend Development", "JavaScript", "Typescript"],
      skillStats: [{ skill: "Frontend Development", verified: 2, corroborating: 2 }],
      evidenceStats: { credentials: 1, verified: 2, corroborating: 3, evidenceTotal: 5, matched: { verified: 2, corroborating: 2 } },
    });
    const answer = buildFallbackMatchAnswer("Rank candidates for a junior full-stack role", [aaiza]);
    const gaps = (answer.candidates[0]?.gaps ?? []).join(" ").toLowerCase();
    expect(gaps).not.toContain("frontend development");
    expect(gaps).toMatch(/node|java|python|api/);
    expect(gaps).toMatch(/sql|postgres|mongo/);
    expect(answer.candidates[0]?.verdict).toMatch(/Evidence on matched skills: 2 verified \(LMS\), 2 corroborating/);
  });

  it("filters Java and Mobile App Development without calling it backend", () => {
    const syed = candidate("q1", {
      name: "Syed Qasim",
      credentialCount: 12,
      evidence: 52,
      verifiedSkills: ["Java", "Mobile App Development", "TypeScript"],
      evidenceStats: { credentials: 12, verified: 5, corroborating: 0, evidenceTotal: 5, matched: { verified: 0, corroborating: 0 } },
    });
    const aaiza = candidate("a1", {
      name: "Aaiza",
      credentialCount: 1,
      evidence: 7,
      verifiedSkills: ["Java", "JavaScript", "TypeScript"],
      evidenceStats: { credentials: 1, verified: 0, corroborating: 0, evidenceTotal: 0, matched: { verified: 0, corroborating: 0 } },
    });
    const answer = buildFallbackMatchAnswer("Show candidates with Java and Mobile App Development", [syed, aaiza]);
    const syedCard = answer.candidates.find((item) => item.id === "q1");
    const aaizaCard = answer.candidates.find((item) => item.id === "a1");
    expect(answer.headline).toBe("1 of 2 candidates has both Java and Mobile App Development.");
    expect(answer.headline.toLowerCase()).not.toContain("backend");
    expect(syedCard?.matchLevel).toBe("full");
    expect(aaizaCard?.matchLevel).toBe("partial");
    expect(aaizaCard?.rank).toBeNull();
    expect(aaizaCard?.verdict).toMatch(/Partial: missing Mobile App Development/);
    expect(aaizaCard?.gaps).toEqual(["Mobile App Development"]);
    expect(aaizaCard?.strengths).toContain("Java");
    expect(aaizaCard?.strengths.join(" ")).not.toMatch(/Node\.js|REST|Express/);
    expect(syedCard?.basis).toEqual({ credentials: 12, evidence: 52, verifiedEvidence: 5 });
    expect(aaizaCard?.basis.evidence).toBe(7);
    expect(aaizaCard?.basis.credentials).toBe(1);
  });

  it("still uses the backend taxonomy when the question names backend", () => {
    const query = parseMatchQuery("Who is best at backend?", ["Java", "Mobile App Development"]);
    expect(query.intent).toBe("rank");
    expect(query.competencies).toContain("backend");
    expect(query.requiredSkills).toEqual([]);
    const answer = buildFallbackMatchAnswer("Who is best at backend?", [
      candidate("a1", { verifiedSkills: ["Java"], skillStats: [{ skill: "Java", verified: 1, corroborating: 0 }] }),
    ]);
    expect(answer.headline.toLowerCase()).toContain("backend");
    expect(answer.candidates[0]?.gaps.join(" ").toLowerCase()).toMatch(/node|api|python/);
  });

  it("extracts explicit skill names before the taxonomy", () => {
    const query = parseMatchQuery("Show candidates with Java and Mobile App Development", ["Java", "Mobile App Development", "TypeScript"]);
    expect(query.intent).toBe("filter");
    expect(query.requiredSkills).toEqual(["Java", "Mobile App Development"]);
    expect(query.competencies).toEqual([]);
  });

  it("answers a skill-count question without a best-match rank", () => {
    const syed = candidate("q1", {
      name: "Syed Qasim",
      credentialCount: 12,
      evidence: 52,
      verifiedSkills: ["dart", "Mobile App Development", "TypeScript", "Java"],
    });
    const aaiza = candidate("a1", {
      name: "Aaiza",
      credentialCount: 1,
      evidence: 7,
      verifiedSkills: ["TypeScript", "Frontend Development", "JavaScript", "Java"],
    });
    const answer = buildFallbackMatchAnswer("Which candidates have 2 or more skills", [syed, aaiza]);
    expect(answer.headline).toBe("2 of 2 candidates have 2 or more skills.");
    expect(answer.candidates.map((item) => item.matchLevel)).toEqual(["count", "count"]);
    expect(answer.candidates.every((item) => item.rank === null)).toBe(true);
    expect(answer.candidates.find((item) => item.id === "q1")?.strengths).toEqual(["Dart", "Mobile App Development", "TypeScript", "Java"]);
    expect(answer.candidates.find((item) => item.id === "a1")?.strengths).toEqual(["TypeScript", "Frontend Development", "JavaScript", "Java"]);
    expect(answer.candidates.find((item) => item.id === "q1")?.verdict).toBe("4 skills");
    const none = buildFallbackMatchAnswer("Which candidates have at least 5 skills", [syed, aaiza]);
    expect(none.headline).toBe("No candidates have 5 or more skills.");
    expect(none.candidates.every((item) => item.matchLevel === "none")).toBe(true);
    expect(none.caution).toMatch(/lower number/);
  });

  it("lists declared skills that have no supporting evidence", () => {
    const syed = candidate("q1", {
      name: "Syed Qasim",
      credentialCount: 12,
      evidence: 52,
      verifiedSkills: ["Dart", "Mobile App Development", "TypeScript", "Java"],
      skillStats: [
        { skill: "TypeScript", verified: 1, corroborating: 2 },
        { skill: "Java", verified: 0, corroborating: 4 },
      ],
    });
    const aaiza = candidate("a1", {
      name: "Aaiza",
      credentialCount: 1,
      evidence: 7,
      verifiedSkills: ["TypeScript", "Java"],
      skillStats: [
        { skill: "TypeScript", verified: 2, corroborating: 0 },
        { skill: "Java", verified: 1, corroborating: 0 },
      ],
    });
    const answer = buildFallbackMatchAnswer("Which candidates have skills without supporting evidence?", [syed, aaiza]);
    const syedCard = answer.candidates.find((item) => item.id === "q1");
    const aaizaCard = answer.candidates.find((item) => item.id === "a1");
    expect(answer.headline).toBe("1 of 2 candidates has skills without supporting evidence.");
    expect(syedCard?.matchLevel).toBe("count");
    expect(syedCard?.rank).toBeNull();
    expect(syedCard?.gaps).toEqual(["Dart", "Mobile App Development"]);
    expect(aaizaCard?.matchLevel).toBe("none");
  });

  it("does not invent a ranking for an unknown question", () => {
    const answer = buildFallbackMatchAnswer("what's the weather", [
      candidate("q1", { verifiedSkills: ["Java"], credentialCount: 12, evidence: 52 }),
    ]);
    expect(answer.headline).toBe("Basic mode can't answer this question. Live AI matching is needed for open-ended questions.");
    expect(answer.candidates).toEqual([]);
    expect(answer.followUps).toHaveLength(4);
    expect(answer.headline).not.toMatch(/shared evidence/);
  });

  it("parses evidence and credential thresholds", () => {
    expect(parseMatchQuery("Who has more than 10 evidence").count).toEqual({ metric: "evidence", operator: ">", value: 10 });
    expect(parseMatchQuery("Candidates with at least 5 credentials").count).toEqual({ metric: "credentials", operator: ">=", value: 5 });
    expect(parseMatchQuery("Who has at least 3 verified evidence").count).toEqual({ metric: "verifiedEvidence", operator: ">=", value: 3 });
  });

  it("treats Typescript, TypeScript, and typescript as the same skill", () => {
    expect(normalizeSkill("Typescript")).toBe(normalizeSkill("TypeScript"));
    expect(normalizeSkill("typescript")).toBe("typescript");
    expect(displaySkill("Typescript")).toBe("TypeScript");
    expect(displaySkill("typescript")).toBe("TypeScript");
    expect(skillsMatch("Javascript", "JavaScript")).toBe(true);
    expect(skillsMatch("Frontend Development", "frontend")).toBe(true);
    expect(skillsMatch("Java", "JavaScript")).toBe(false);
  });
});
