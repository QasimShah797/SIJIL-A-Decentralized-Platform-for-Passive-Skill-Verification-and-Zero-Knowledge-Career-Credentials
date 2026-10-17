import { describe, expect, it } from "vitest";
import type { CandidateView } from "@/lib/db/candidates";
import { matchJobSkills, parseSkillList } from "@/lib/recruiter-jobs";

function candidate(skills: string[]): CandidateView {
  return {
    id: "c1",
    name: "Ayesha",
    topSkill: skills[0] ?? "—",
    evidence: 1,
    reviews: 0,
    attestation: "Approved",
    institution: "CUST",
    credentialCount: 1,
    searchableSkills: skills,
    verifiedSkills: skills,
  };
}

describe("recruiter jobs", () => {
  it("keeps unique required skills", () => {
    expect(parseSkillList("React, react, TypeScript")).toEqual(["React", "TypeScript"]);
  });

  it("matches a candidate when a required skill overlaps", () => {
    expect(matchJobSkills(["React", "SQL"], candidate(["React.js", "Figma"]))).toEqual(["React"]);
  });

  it("returns no hits when skills do not overlap", () => {
    expect(matchJobSkills(["Go"], candidate(["Python"]))).toEqual([]);
  });
});
