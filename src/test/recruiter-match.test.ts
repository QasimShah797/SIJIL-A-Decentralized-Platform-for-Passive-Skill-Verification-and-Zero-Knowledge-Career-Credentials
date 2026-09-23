import { describe, expect, it } from "vitest";
import type { CandidateView } from "@/lib/db/candidates";
import type { CandidateSkill } from "@/lib/sijil-data";
import { compareLearners, findComparePair, isCompareAsk, parseRequirement, rankCandidatesForRequirement, resolveCompareAsk } from "@/lib/recruiter-match";

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
});
