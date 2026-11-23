import { describe, expect, it } from "vitest";
import type { CandidateView } from "@/lib/db/candidates";
import { aggregateRecruiterDashboardSkillCounts } from "@/lib/recruiter-dashboard-skills";

function candidate(
  id: string,
  verifiedSkills: string[],
  overrides: Partial<CandidateView> = {},
): CandidateView {
  return {
    id,
    name: `Candidate ${id}`,
    topSkill: "—",
    evidence: 0,
    reviews: 0,
    attestation: "Approved",
    institution: "CUST",
    credentialCount: 1,
    searchableSkills: [],
    verifiedSkills,
    ...overrides,
  };
}

describe("aggregateRecruiterDashboardSkillCounts", () => {
  it("merges Java, java, and JAVA into one entry with unique candidate count", () => {
    const rows = aggregateRecruiterDashboardSkillCounts(
      [
        candidate("c1", ["Java"]),
        candidate("c2", ["java"]),
        candidate("c3", ["JAVA"]),
        candidate("c4", ["Java", "java"]),
      ],
      10,
    );
    const java = rows.find(([label]) => label === "Java");
    expect(java).toEqual(["Java", 4]);
    expect(rows.filter(([label]) => label === "Java")).toHaveLength(1);
  });

  it("counts one candidate once when they list duplicate casings", () => {
    const rows = aggregateRecruiterDashboardSkillCounts([candidate("solo", ["java", "JAVA", "Java"])], 10);
    expect(rows).toEqual([["Java", 1]]);
  });

  it("keeps Java, JavaScript, C, C++, and C# distinct", () => {
    const rows = aggregateRecruiterDashboardSkillCounts(
      [candidate("c1", ["Java", "JavaScript", "C", "C++", "C#"])],
      10,
    );
    const labels = rows.map(([label]) => label).sort();
    expect(labels).toEqual(["C", "C#", "C++", "Java", "JavaScript"]);
  });
});