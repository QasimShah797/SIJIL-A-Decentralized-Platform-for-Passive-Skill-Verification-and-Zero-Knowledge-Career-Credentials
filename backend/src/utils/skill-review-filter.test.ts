import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterProjectsForDeclaredSkills,
  reviewMatchesDeclaredSkills,
} from "./skill-review-filter";

const TYPESCRIPT = { id: "skill-typescript", name: "TypeScript" };

describe("backend competency review matching", () => {
  it("matches an exact competency id even when the names differ", () => {
    assert.equal(reviewMatchesDeclaredSkills(
      { skill: "Go", skillId: TYPESCRIPT.id },
      [TYPESCRIPT],
    ), true);
  });

  it("matches an equivalent normalized competency name", () => {
    assert.equal(reviewMatchesDeclaredSkills(
      { skill: "  typescript " },
      [TYPESCRIPT],
    ), true);
    assert.equal(reviewMatchesDeclaredSkills(
      { skill: "java" },
      [{ id: "skill-java", name: "Java" }],
    ), true);
  });

  it("does not match a shorter competency name inside a longer name", () => {
    assert.equal(reviewMatchesDeclaredSkills(
      { skill: "JavaScript" },
      [{ id: "skill-java", name: "Java" }],
    ), false);
    assert.equal(reviewMatchesDeclaredSkills(
      { skill: "React Native" },
      [{ id: "skill-react", name: "React" }],
    ), false);
    assert.equal(reviewMatchesDeclaredSkills(
      { skill: "React" },
      [{ id: "skill-native", name: "React Native" }],
    ), false);
  });

  it("rejects a missing or empty skill name when no competency id matches", () => {
    assert.equal(reviewMatchesDeclaredSkills({ skill: "" }, [TYPESCRIPT]), false);
    assert.equal(reviewMatchesDeclaredSkills({ skill: "TypeScript", skillId: null }, [{ id: "skill-blank", name: "  " }]), false);
    assert.equal(reviewMatchesDeclaredSkills({ skill: "TypeScript" }, []), false);
  });
});

describe("backend competency project matching", () => {
  it("keeps a project linked by exact competency id", () => {
    const projects = filterProjectsForDeclaredSkills([{
      id: "proj-1",
      skillLinks: [{ skillId: TYPESCRIPT.id, skillName: "Unrelated" }],
      linkedSkills: [],
    }], [TYPESCRIPT]);
    assert.equal(projects.length, 1);
    assert.equal(projects[0]?.skillLinks[0]?.skillId, TYPESCRIPT.id);
  });

  it("keeps a project whose linked skill matches after normalization", () => {
    const projects = filterProjectsForDeclaredSkills([{
      id: "proj-1",
      linkedSkills: ["  typescript "],
    }], [TYPESCRIPT]);
    assert.deepEqual(projects[0]?.linkedSkills, ["  typescript "]);
  });

  it("keeps a project linked by an equal competency name", () => {
    const projects = filterProjectsForDeclaredSkills([{
      id: "proj-java",
      skillLinks: [{ skillId: "other", skillName: "Java" }],
      linkedSkills: ["Java"],
    }], [{ id: "skill-java", name: "Java" }]);
    assert.deepEqual(projects.map((project) => project.id), ["proj-java"]);
    assert.deepEqual(projects[0]?.skillLinks, [{ skillId: "other", skillName: "Java" }]);
  });

  it("does not keep a project when a short name is only contained in a longer name", () => {
    const projects = filterProjectsForDeclaredSkills([{
      id: "proj-1",
      skillLinks: [{ skillId: "other", skillName: "JavaScript" }],
      linkedSkills: ["JavaScript", "React Native"],
    }], [
      { id: "skill-java", name: "Java" },
      { id: "skill-react", name: "React" },
    ]);
    assert.deepEqual(projects, []);
  });

  it("drops projects when the declared skill name is empty and the id does not match", () => {
    const projects = filterProjectsForDeclaredSkills([{
      id: "proj-1",
      skillLinks: [{ skillId: "other", skillName: "TypeScript" }],
      linkedSkills: ["TypeScript"],
    }], [{ id: "skill-blank", name: "" }]);
    assert.deepEqual(projects, []);
  });
});
