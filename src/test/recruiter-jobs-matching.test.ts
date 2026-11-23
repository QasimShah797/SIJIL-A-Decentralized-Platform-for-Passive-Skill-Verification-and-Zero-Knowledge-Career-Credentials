import { describe, expect, it } from "vitest";
import type { CandidateView } from "@/lib/db/candidates";
import { matchJobSkills } from "@/lib/recruiter-jobs";

const base: CandidateView = {
  id: "c1",
  name: "Test",
  topSkill: "—",
  evidence: 0,
  reviews: 0,
  attestation: "Pending",
  institution: "CUST",
  credentialCount: 0,
  searchableSkills: ["Java", "JavaScript", "TypeScript", "C++", "C#"],
  verifiedSkills: [],
};

describe("recruiter job skill matching", () => {
  it("matches Java case-insensitively but not JavaScript", () => {
    expect(matchJobSkills(["java"], base)).toEqual(["java"]);
    expect(matchJobSkills(["JAVA"], base)).toEqual(["JAVA"]);
    expect(matchJobSkills(["JavaScript"], base)).toEqual(["JavaScript"]);
    expect(matchJobSkills(["Java"], base)).toEqual(["Java"]);
    expect(matchJobSkills(["JavaScript"], { ...base, searchableSkills: ["Java"] })).toEqual([]);
  });

  it("keeps C, C++, and C# distinct", () => {
    const cSkills = { ...base, searchableSkills: ["C", "C++", "C#"] };
    expect(matchJobSkills(["C"], cSkills)).toEqual(["C"]);
    expect(matchJobSkills(["C++"], cSkills)).toEqual(["C++"]);
    expect(matchJobSkills(["C#"], cSkills)).toEqual(["C#"]);
    expect(matchJobSkills(["C"], { ...base, searchableSkills: ["C++"] })).toEqual([]);
  });
});