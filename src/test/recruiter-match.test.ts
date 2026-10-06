import { describe, expect, it } from "vitest";
import type { CandidateView } from "@/lib/db/candidates";
import type { CandidateSkill } from "@/lib/sijil-data";
import { compareLearners, findComparePair, isCompareAsk, parseInterpretedAsk, parseRequirement, rankCandidatesForRequirement, requirementFromInterpretation, resolveCompareAsk, resolveInterpretedAsk } from "@/lib/recruiter-match";

const candidate = (id: string, extras: Partial<CandidateView> = {}): CandidateView => ({
  id,
  name: id,
  topSkill: "TypeScript",
  evidence: 2,
  reviews: 1,
  attestation: "Approved",
  institution: "COMSATS",
  credentialCount: 1,
  searchableSkills: ["TypeScript"],
  ...extras,
});

const skill = (overrides: Partial<CandidateSkill> = {}): CandidateSkill => ({
  skill: "TypeScript",
  domain: "Frontend",
  evidence: 3,
  reviews: 1,
  lmsRecords: 2,
  githubRecords: 0,
  practicalTask: "—",
  externalCert: "—",
  attestation: "Approved",
  attestationSource: "COMSATS",
  attestationDid: "",
  credentialId: "c1",
  ...overrides,
});

describe("recruiter match", () => {
  it("compares learners who have Java GitHub projects", () => {
    const req = parseRequirement("compare the learners that have java projects", []);
    expect(req.skills).toEqual(["Java"]);
    expect(req.requireGithub).toBe(true);

    const javaOne = candidate("j1", {
      name: "Java One",
      topSkill: "Java",
      searchableSkills: ["Java"],
      skillEvidence: [{ skill: "Java", githubRecords: 2, lmsRecords: 0, reviews: 0, practicalTask: "—" }],
    });
    const javaTwo = candidate("j2", {
      name: "Java Two",
      topSkill: "Java",
      searchableSkills: ["Java"],
      skillEvidence: [{ skill: "Java", githubRecords: 1, lmsRecords: 0, reviews: 0, practicalTask: "—" }],
    });
    const jsOnly = candidate("js1", {
      name: "Script Only",
      topSkill: "JavaScript",
      searchableSkills: ["JavaScript"],
      skillEvidence: [{ skill: "JavaScript", githubRecords: 5, lmsRecords: 0, reviews: 0, practicalTask: "—" }],
    });

    const resolved = resolveCompareAsk(
      "compare the learners that have java projects",
      [javaOne, javaTwo, jsOnly],
      {},
      ["Java", "JavaScript"],
    );
    expect([resolved.compare?.left.id, resolved.compare?.right.id].sort()).toEqual(["j1", "j2"]);
    expect(resolved.text).toMatch(/Java/i);
  });

  it("resolves two learner names for a compare ask", () => {
    const qasim = candidate("q1", { name: "Syed Qasim Ali Shah", searchableSkills: ["Dart"] });
    const aaiza = candidate("a1", { name: "Aaiza Islam", searchableSkills: ["TypeScript"] });
    expect(isCompareAsk("compare syed qasim profile with aaiza islam profile")).toBe(true);
    const pair = findComparePair("compare syed qasim profile with aaiza islam profile", [qasim, aaiza]);
    expect(pair.map((item) => item.id).sort()).toEqual(["a1", "q1"]);
    const compared = compareLearners(pair[0], pair[1], {});
    expect(compared.summary).toMatch(/Dart/i);
    expect(compared.summary).toMatch(/TypeScript/i);
  });

  it("does not treat projects as TypeScript when asking for Dart", () => {
    const req = parseRequirement("dart with github projects", ["TypeScript", "Dart"]);
    expect(req.skills).toEqual(["Dart"]);
    expect(req.requireGithub).toBe(true);

    const ranked = rankCandidatesForRequirement(
      req,
      [
        candidate("has-dart", {
          topSkill: "Dart",
          searchableSkills: ["Dart"],
          skillEvidence: [{
            skill: "Dart",
            githubRecords: 2,
            lmsRecords: 0,
            reviews: 0,
            practicalTask: "—",
          }],
        }),
        candidate("only-ts", {
          searchableSkills: ["TypeScript"],
          skillEvidence: [{
            skill: "TypeScript",
            githubRecords: 4,
            lmsRecords: 0,
            reviews: 0,
            practicalTask: "—",
          }],
        }),
      ],
      {},
    );
    expect(ranked.map((item) => item.candidate.id)).toEqual(["has-dart"]);
  });

  it("does not count Moodle from another skill as Dart Moodle", () => {
    const req = parseRequirement("dart with Moodle evidence", ["Dart", "TypeScript"]);
    expect(req.requireLms).toBe(true);
    const ranked = rankCandidatesForRequirement(
      req,
      [candidate("qasim", {
        topSkill: "Dart",
        searchableSkills: ["Dart", "TypeScript"],
        skillEvidence: [
          { skill: "Dart", githubRecords: 2, lmsRecords: 0, reviews: 0, practicalTask: "—" },
          { skill: "TypeScript", githubRecords: 1, lmsRecords: 4, reviews: 0, practicalTask: "—" },
        ],
      })],
      {},
    );
    expect(ranked).toEqual([]);
  });

  it("parses competency and LMS language", () => {
    const req = parseRequirement("Need TypeScript with Moodle evidence", ["TypeScript", "Dart"]);
    expect(req.skills).toContain("TypeScript");
    expect(req.requireLms).toBe(true);
  });

  it("uses shared wallet GitHub evidence, not declared-skill placeholders", () => {
    const req = parseRequirement("TypeScript with GitHub project", ["Dart"]);
    const ranked = rankCandidatesForRequirement(
      req,
      [candidate("shared-ts", {
        skillEvidence: [{
          skill: "TypeScript",
          githubRecords: 3,
          lmsRecords: 0,
          reviews: 0,
          practicalTask: "—",
        }],
        searchableSkills: ["TypeScript"],
      })],
      { "shared-ts": [skill({ skill: "Dart", githubRecords: 0 })] },
    );
    expect(ranked.map((item) => item.candidate.id)).toEqual(["shared-ts"]);
  });

  it("requires GitHub on the asked skill, not another competency", () => {
    const req = parseRequirement("TypeScript with GitHub project", ["TypeScript"]);
    const ranked = rankCandidatesForRequirement(
      req,
      [candidate("ts-github"), candidate("ts-only-github-elsewhere")],
      {
        "ts-github": [skill({ githubRecords: 2 })],
        "ts-only-github-elsewhere": [
          skill({ githubRecords: 0 }),
          skill({ skill: "Dart", githubRecords: 4 }),
        ],
      },
    );
    expect(ranked.map((item) => item.candidate.id)).toEqual(["ts-github"]);
  });

  it("excludes learners without required LMS evidence", () => {
    const req = parseRequirement("TypeScript with LMS", ["TypeScript"]);
    const ranked = rankCandidatesForRequirement(
      req,
      [candidate("with-lms"), candidate("no-lms", { name: "No LMS" })],
      {
        "with-lms": [skill()],
        "no-lms": [skill({ lmsRecords: 0 })],
      },
    );
    expect(ranked.map((item) => item.candidate.id)).toEqual(["with-lms"]);
    expect(ranked[0].reasons.some((reason) => /LMS/i.test(reason))).toBe(true);
  });

  it("maps a Gemini interpretation of Flutter onto Dart with GitHub proof", () => {
    const interpreted = parseInterpretedAsk({
      intent: "match",
      skills: ["Flutter", "GitHub"],
      requireLms: false,
      requireGithub: true,
      requireTask: false,
      requireReviews: false,
      learnerNames: [],
      reply: "You want learners who shared Dart and a GitHub project.",
    });
    expect(interpreted).not.toBeNull();
    const requirement = requirementFromInterpretation(interpreted!, ["TypeScript", "Dart"]);
    expect(requirement.skills).toEqual(["Dart"]);
    expect(requirement.requireGithub).toBe(true);

    const resolved = resolveInterpretedAsk(
      interpreted!,
      [
        candidate("has-dart", {
          topSkill: "Dart",
          searchableSkills: ["Dart"],
          skillEvidence: [{ skill: "Dart", githubRecords: 2, lmsRecords: 0, reviews: 0, practicalTask: "—" }],
        }),
        candidate("only-ts", {
          searchableSkills: ["TypeScript"],
          skillEvidence: [{ skill: "TypeScript", githubRecords: 4, lmsRecords: 0, reviews: 0, practicalTask: "—" }],
        }),
      ],
      {},
      ["TypeScript", "Dart"],
    );
    expect(resolved.matches?.map((item) => item.candidate.id)).toEqual(["has-dart"]);
    expect(resolved.text).toMatch(/Dart/i);
    expect(resolved.text).toMatch(/shared evidence/i);
  });

  it("compares the two learners Gemini named", () => {
    const qasim = candidate("q1", { name: "Syed Qasim Ali Shah", searchableSkills: ["Dart"] });
    const aaiza = candidate("a1", { name: "Aaiza Islam", searchableSkills: ["TypeScript"] });
    const resolved = resolveInterpretedAsk(
      {
        intent: "compare",
        skills: [],
        requireLms: false,
        requireGithub: false,
        requireTask: false,
        requireReviews: false,
        learnerNames: ["Qasim", "Aaiza"],
        reply: "You want Qasim and Aaiza compared.",
      },
      [qasim, aaiza],
      {},
      ["Dart", "TypeScript"],
    );
    expect([resolved.compare?.left.id, resolved.compare?.right.id].sort()).toEqual(["a1", "q1"]);
  });

  it("asks for a clearer question when Gemini cannot tell what to search", () => {
    const resolved = resolveInterpretedAsk(
      {
        intent: "clarify",
        skills: [],
        requireLms: false,
        requireGithub: false,
        requireTask: false,
        requireReviews: false,
        learnerNames: [],
        reply: "Tell me a competency or two learner names.",
      },
      [candidate("q1", { name: "Syed Qasim Ali Shah" })],
      {},
      ["Dart"],
    );
    expect(resolved.matches).toBeUndefined();
    expect(resolved.compare).toBeUndefined();
    expect(resolved.text).toMatch(/competency/i);
  });

  it("lists learners from an institution even when Gemini asks for a skill", () => {
    const qasim = candidate("q1", { name: "Syed Qasim Ali Shah", institution: "CUST", searchableSkills: ["Dart"] });
    const aaiza = candidate("a1", { name: "Aaiza Islam", institution: "CUST", searchableSkills: ["TypeScript"] });
    const other = candidate("o1", { name: "Other Learner", institution: "NUST", searchableSkills: ["Java"] });
    const resolved = resolveInterpretedAsk(
      {
        intent: "clarify",
        skills: [],
        requireLms: false,
        requireGithub: false,
        requireTask: false,
        requireReviews: false,
        learnerNames: [],
        reply: "I need more information. Please specify what skills you are looking for.",
      },
      [qasim, aaiza, other],
      {},
      ["Dart", "TypeScript", "Java"],
      "learner that are from institution of cust",
    );
    expect(resolved.matches?.map((item) => item.candidate.id).sort()).toEqual(["a1", "q1"]);
    expect(resolved.text).toMatch(/Aaiza Islam/);
    expect(resolved.text).toMatch(/Syed Qasim Ali Shah/);
    expect(resolved.text).toMatch(/CUST/);
    expect(resolved.text).not.toMatch(/more information|You want learners/i);
  });

  it("says when nobody shared from the institution in the question", () => {
    const resolved = resolveInterpretedAsk(
      {
        intent: "clarify",
        skills: [],
        requireLms: false,
        requireGithub: false,
        requireTask: false,
        requireReviews: false,
        learnerNames: [],
        reply: "You want learners from NUST.",
      },
      [candidate("q1", { name: "Syed Qasim Ali Shah", institution: "CUST" })],
      {},
      ["Dart"],
      "learner from nust",
    );
    expect(resolved.matches).toEqual([]);
    expect(resolved.text).toMatch(/No shared learner is from NUST/);
    expect(resolved.text).toMatch(/CUST/);
  });

  it("lists each campus when the question does not name one", () => {
    const resolved = resolveInterpretedAsk(
      {
        intent: "clarify",
        skills: [],
        requireLms: false,
        requireGithub: false,
        requireTask: false,
        requireReviews: false,
        learnerNames: [],
        institution: "AN",
        reply: "You want learners from an institution.",
      },
      [
        candidate("q1", { name: "Syed Qasim Ali Shah", institution: "CUST" }),
        candidate("a1", { name: "Aaiza Islam", institution: "CUST" }),
      ],
      {},
      ["Dart"],
      "Learners from an institution",
    );
    expect(resolved.text).toMatch(/CUST/);
    expect(resolved.text).toMatch(/Syed Qasim Ali Shah/);
    expect(resolved.text).toMatch(/Aaiza Islam/);
    expect(resolved.text).not.toMatch(/\bAN\b/);
  });

  it("lists learners with at least the requested number of shared skills", () => {
    const broad = candidate("q1", {
      name: "Syed Qasim Ali Shah",
      searchableSkills: ["Dart", "Java", "TypeScript"],
      verifiedSkills: ["Dart", "Java", "TypeScript"],
    });
    const narrow = candidate("a1", {
      name: "Aaiza Islam",
      searchableSkills: ["Typescript", "Javascript", "Frontend Development", "Backend Development"],
      verifiedSkills: ["Typescript", "Javascript"],
      skillEvidence: [
        { skill: "Typescript", githubRecords: 1, lmsRecords: 1, reviews: 0, practicalTask: "—" },
        { skill: "Javascript", githubRecords: 0, lmsRecords: 1, reviews: 0, practicalTask: "—" },
        { skill: "HTML", githubRecords: 1, lmsRecords: 0, reviews: 0, practicalTask: "—" },
      ],
    });
    const resolved = resolveInterpretedAsk(
      {
        intent: "clarify",
        skills: [],
        requireLms: false,
        requireGithub: false,
        requireTask: false,
        requireReviews: false,
        learnerNames: [],
        reply: "I understood you are looking for learners who have 3 or more skills.",
      },
      [broad, narrow],
      {},
      ["Dart", "Java", "TypeScript"],
      "learner having 3 or more skills",
    );
    expect(resolved.matches?.map((item) => item.candidate.id)).toEqual(["q1"]);
    expect(resolved.text).toMatch(/Syed Qasim Ali Shah/);
    expect(resolved.text).not.toMatch(/Aaiza Islam/);
    expect(resolved.matches?.[0].reasons.some((reason) => reason === "3 shared skills")).toBe(true);
  });

  it("names the stronger learner when asked who is better for a skill", () => {
    const qasim = candidate("q1", {
      name: "Syed Qasim Ali Shah",
      topSkill: "Java",
      searchableSkills: ["Java"],
      skillEvidence: [{ skill: "Java", githubRecords: 2, lmsRecords: 0, reviews: 0, practicalTask: "Submitted" }],
    });
    const aaiza = candidate("a1", {
      name: "Aaiza Islam",
      topSkill: "Java",
      searchableSkills: ["Java"],
      attestation: "Pending",
      skillEvidence: [{ skill: "Java", githubRecords: 1, lmsRecords: 0, reviews: 0, practicalTask: "—" }],
    });
    const resolved = resolveInterpretedAsk(
      {
        intent: "match",
        skills: ["Java"],
        requireLms: false,
        requireGithub: false,
        requireTask: false,
        requireReviews: false,
        learnerNames: [],
        reply: "You want the better Java developer.",
      },
      [aaiza, qasim],
      {},
      ["Java"],
      "which candidate is better for java development?",
    );
    expect(resolved.matches?.[0].candidate.id).toBe("q1");
    expect(resolved.text).toMatch(/Syed Qasim Ali Shah is the stronger match for Java/);
    expect(resolved.text).toMatch(/ahead of Aaiza Islam/);
  });
});
