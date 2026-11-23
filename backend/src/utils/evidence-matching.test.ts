import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  skillRelatesToRepositoryLanguage,
  declaredCompetencyNamesEqual,
} from "./competency-matching";
import { evaluateSkillProjectMatch } from "./evidence-matching";

describe("evidence-matching", () => {
  it("Java does not match JavaScript in repository language breakdown", () => {
    assert.equal(skillRelatesToRepositoryLanguage("Java", "JavaScript"), false);
    assert.equal(skillRelatesToRepositoryLanguage("Java", "Java"), true);

    const result = evaluateSkillProjectMatch(
      { id: "j", name: "Java", domain: "General" },
      {
        repositoryName: "node-app",
        description: null,
        primaryLanguage: "JavaScript",
        languageBreakdown: { JavaScript: 95 },
        topics: [],
        dependencies: [],
      },
    );
    assert.equal(result.signals.languageMatch, undefined);
  });

  it("case-insensitive competency names", () => {
    assert.equal(declaredCompetencyNamesEqual("Python", "PYTHON"), true);
    assert.equal(declaredCompetencyNamesEqual("JavaScript", "java"), false);
  });
});