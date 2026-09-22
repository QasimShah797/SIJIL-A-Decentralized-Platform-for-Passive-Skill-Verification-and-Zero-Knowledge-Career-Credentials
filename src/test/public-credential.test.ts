import { describe, expect, it } from "vitest";
import {
  atsResumeToPlainText,
  buildAtsResume,
  buildEvidenceLedger,
  extractAtsHeadings,
  inspectorViewFromLedger,
  publicCompetencyPath,
} from "@/lib/public-credential";

const shareToken = "11111111-2222-4333-8444-555555555555";
const competencyId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const payload = {
  competency: {
    competencyId,
    name: "React.js",
    domain: "Frontend",
  },
  learner: {
    name: "Ada Lovelace",
    institution: "CUST",
    program: "Computer Science",
    cityCountry: "Islamabad, Pakistan",
    careerGoal: "Build verifiable career credentials.",
    skillsSummary: "React.js, PostgreSQL",
    contact: { email: "ada@university.edu", phone: "+92 300 0000000" },
  },
  skills: [
    { competencyId, name: "React.js", primary: true, evidenceBacked: true },
    { competencyId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff", name: "PostgreSQL", primary: false, evidenceBacked: true },
  ],
  evidence: {
    github: {
      repos: [{ full_name: "ada/sijil", primary_language: "TypeScript", commit_count: 42 }],
    },
    lms: {
      assignments: [{ name: "Frontend lab", course_name: "Web Engineering", grade: 92, grade_max: 100 }],
    },
    practicalTask: {
      latestAttempt: { title: "React practical", status: "Passed", scorePercent: 88, passed: true, submittedAt: "2026-09-01T00:00:00.000Z" },
    },
    peerReviews: [{ reviewer_name: "Grace Hopper", review_text: "Strong component design." }],
  },
  credentialMetadata: [{ skill_name: "SIJIL Frontend credential", issuer_name: "SIJIL" }],
};

describe("ATS resume mapping", () => {
  it("emits standard resume headings and clickable skill names", () => {
    const resume = buildAtsResume(payload, shareToken, competencyId);
    const text = atsResumeToPlainText(resume);

    expect(extractAtsHeadings(text)).toEqual([
      "SUMMARY",
      "EDUCATION",
      "SKILLS",
      "ADDITIONAL INFORMATION",
    ]);
    expect(text).toContain("Ada Lovelace");
    expect(resume.photoUrl).toBeUndefined();
    expect(text).toContain("React.js");
    expect(text).toContain("PostgreSQL");
    expect(resume.skills[0]?.href).toBe(publicCompetencyPath(shareToken, competencyId));
    expect(resume.skills[0]?.href.startsWith("/credential/")).toBe(true);
    expect(resume.skills.every((skill) => skill.href.includes("/competency/"))).toBe(true);
    expect(resume.skills.find((skill) => skill.name === "React.js")?.ledger?.some((item) => item.source === "github")).toBe(true);
    expect(text).not.toContain("WORK EXPERIENCE");
  });

  it("does not invent hidden learner or grade fields", () => {
    const hidden = buildAtsResume({
      competency: { competencyId, name: "Go" },
    }, shareToken, competencyId);

    expect(hidden.name).toBe("Learner");
    expect(hidden.contact.email).toBeUndefined();
    expect(hidden.education).toEqual([]);
    expect(hidden.workExperience).toEqual([]);
    expect(hidden.skills.map((skill) => skill.name)).toEqual(["Go"]);
    expect(hidden.photoUrl).toBeUndefined();
  });

  it("maps a disclosed profile photo onto the resume", () => {
    const withPhoto = buildAtsResume({
      competency: { competencyId, name: "Go" },
      learner: { name: "Ada Lovelace", photoUrl: "https://cdn.example/ada.jpg" },
    }, shareToken, competencyId);
    expect(withPhoto.photoUrl).toBe("https://cdn.example/ada.jpg");
  });

  it("hides the profile photo when the learner opted out", () => {
    const hidden = buildAtsResume({
      competency: { competencyId, name: "Go" },
      learner: { name: "Ada Lovelace", photoUrl: "https://cdn.example/ada.jpg", photoHidden: true },
    }, shareToken, competencyId);
    expect(hidden.photoUrl).toBeUndefined();
  });
});

describe("public evidence ledger", () => {
  it("keeps LMS items pre-verified and GitHub/task/reviews corroborating", () => {
    const ledger = buildEvidenceLedger(payload, competencyId, [
      "lms_evidence",
      "github_evidence",
      "practical_task_result",
      "peer_reviews",
    ]);

    expect(ledger.find((item) => item.source === "lms")?.trustTierLabel).toBe("LMS pre-verified");
    expect(ledger.find((item) => item.source === "github")?.trustTierLabel).toBe("Corroborating");
    expect(ledger.find((item) => item.source === "practical_task")?.trustTierLabel).toBe("Corroborating");
    expect(ledger.find((item) => item.source === "peer_review")?.trustTierLabel).toBe("Corroborating");
  });

  it("omits evidence sources the learner did not disclose", () => {
    const ledger = buildEvidenceLedger(payload, competencyId, ["competency_name"]);
    expect(ledger).toEqual([]);
  });

  it("shows sibling competency evidence from the shared skill snapshot", () => {
    const siblingId = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
    const ledger = buildEvidenceLedger({
      competency: { competencyId, name: "React.js" },
      skills: [{
        competencyId: siblingId,
        name: "PostgreSQL",
        evidence: {
          github: { repos: [{ full_name: "ada/db", primary_language: "SQL", commit_count: 11 }] },
        },
      }],
    }, siblingId, ["competency_name"]);

    expect(ledger.find((item) => item.source === "github")?.title).toBe("ada/db");
    expect(ledger.find((item) => item.source === "github")?.trustTierLabel).toBe("Corroborating");

    const inspector = inspectorViewFromLedger(ledger);
    expect(inspector.githubRepos[0]?.name).toBe("ada/db");
    expect(inspector.githubRepos[0]?.language).toBe("SQL");
    expect(inspector.availableSources).toContain("github");
  });
});
