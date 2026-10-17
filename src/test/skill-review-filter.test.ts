import { describe, expect, it } from "vitest";
import {
  filterProjectsForDeclaredSkills,
  reviewMatchesDeclaredSkills,
} from "@/lib/skill-review-filter";

const TYPESCRIPT = { id: "skill-typescript", name: "TypeScript" };

describe("learner competency review matching", () => {
  it("matches an exact competency id even when the names differ", () => {
    expect(reviewMatchesDeclaredSkills(
      { skill: "Go", skillId: TYPESCRIPT.id },
      [TYPESCRIPT],
    )).toBe(true);
  });

  it("matches an equivalent normalized competency name", () => {
    expect(reviewMatchesDeclaredSkills({ skill: "  typescript " }, [TYPESCRIPT])).toBe(true);
  });

  it("currently treats a short competency name inside a longer name as a match", () => {
    expect(reviewMatchesDeclaredSkills(
      { skill: "JavaScript" },
      [{ id: "skill-java", name: "Java" }],
    )).toBe(true);
  });

  it("rejects a missing or empty skill name when no competency id matches", () => {
    expect(reviewMatchesDeclaredSkills({ skill: "" }, [TYPESCRIPT])).toBe(false);
    expect(reviewMatchesDeclaredSkills(
      { skill: "TypeScript", skillId: null },
      [{ id: "skill-blank", name: "  " }],
    )).toBe(false);
    expect(reviewMatchesDeclaredSkills({ skill: "TypeScript" }, [])).toBe(false);
  });
});

describe("learner competency project matching", () => {
  it("keeps a project linked by exact competency id", () => {
    const projects = filterProjectsForDeclaredSkills([{
      id: "proj-1",
      skillLinks: [{ skillId: TYPESCRIPT.id, skillName: "Unrelated" }],
      linkedSkills: [],
    }], [TYPESCRIPT]);
    expect(projects).toHaveLength(1);
    expect(projects[0]?.skillLinks[0]?.skillId).toBe(TYPESCRIPT.id);
  });

  it("keeps a project whose linked skill matches after normalization", () => {
    const projects = filterProjectsForDeclaredSkills([{
      id: "proj-1",
      linkedSkills: ["  typescript "],
    }], [TYPESCRIPT]);
    expect(projects[0]?.linkedSkills).toEqual(["  typescript "]);
  });

  it("currently keeps a project when a short name is contained in a longer name", () => {
    const projects = filterProjectsForDeclaredSkills([{
      id: "proj-1",
      skillLinks: [{ skillId: "other", skillName: "JavaScript" }],
      linkedSkills: ["JavaScript"],
    }], [{ id: "skill-java", name: "Java" }]);
    expect(projects.map((project) => project.id)).toEqual(["proj-1"]);
  });

  it("drops projects when the declared skill name is empty and the id does not match", () => {
    const projects = filterProjectsForDeclaredSkills([{
      id: "proj-1",
      skillLinks: [{ skillId: "other", skillName: "TypeScript" }],
      linkedSkills: ["TypeScript"],
    }], [{ id: "skill-blank", name: "" }]);
    expect(projects).toEqual([]);
  });
});
