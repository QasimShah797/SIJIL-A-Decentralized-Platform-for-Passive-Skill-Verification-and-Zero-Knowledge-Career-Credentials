import { describe, expect, it } from "vitest";
import {
  declaredCompetencyNamesEqual,
  skillRelatesToRepositoryLanguage,
  skillReferencedInText,
} from "@/lib/competency-matching";
import { evaluateSkillProjectMatch } from "../../backend/src/utils/evidence-matching";

describe("competency-matching (GitHub languages)", () => {
  it("matches Java only to Java, not JavaScript or TypeScript", () => {
    expect(skillRelatesToRepositoryLanguage("Java", "Java")).toBe(true);
    expect(skillRelatesToRepositoryLanguage("JAVA", "java")).toBe(true);
    expect(skillRelatesToRepositoryLanguage("Java", "JavaScript")).toBe(false);
    expect(skillRelatesToRepositoryLanguage("Java", "TypeScript")).toBe(false);
    expect(skillRelatesToRepositoryLanguage("Java", "Python")).toBe(false);
  });

  it("matches JavaScript only to JavaScript, not Java", () => {
    expect(skillRelatesToRepositoryLanguage("JavaScript", "JavaScript")).toBe(true);
    expect(skillRelatesToRepositoryLanguage("javascript", "JavaScript")).toBe(true);
    expect(skillRelatesToRepositoryLanguage("JavaScript", "Java")).toBe(false);
  });

  it("distinguishes C, C++, and C#", () => {
    expect(skillRelatesToRepositoryLanguage("C", "C")).toBe(true);
    expect(skillRelatesToRepositoryLanguage("C", "C++")).toBe(false);
    expect(skillRelatesToRepositoryLanguage("C", "C#")).toBe(false);
    expect(skillRelatesToRepositoryLanguage("C++", "C++")).toBe(true);
    expect(skillRelatesToRepositoryLanguage("C++", "C")).toBe(false);
    expect(skillRelatesToRepositoryLanguage("C#", "C#")).toBe(true);
    expect(skillRelatesToRepositoryLanguage("C#", "C")).toBe(false);
  });

  it("treats competency names case-insensitively for dedup keys", () => {
    expect(declaredCompetencyNamesEqual("Java", "java")).toBe(true);
    expect(declaredCompetencyNamesEqual("Java", "JAVA")).toBe(true);
    expect(declaredCompetencyNamesEqual("React", "REACT")).toBe(true);
    expect(declaredCompetencyNamesEqual("Java", "JavaScript")).toBe(false);
  });

  it("does not match Java in javascript repo names via text rules", () => {
    expect(skillReferencedInText("Java", "my-javascript-app")).toBe(false);
    expect(skillReferencedInText("Java", "spring-java-api")).toBe(true);
    expect(skillReferencedInText("JavaScript", "my-javascript-app")).toBe(true);
  });

  it("evaluateSkillProjectMatch links Java repos from language breakdown only", () => {
    const skill = { id: "1", name: "Java", domain: "General" };
    const javaRepo = evaluateSkillProjectMatch(skill, {
      repositoryName: "spring-demo",
      description: null,
      primaryLanguage: "Java",
      languageBreakdown: { Java: 92, HTML: 8 },
      topics: [],
      dependencies: [],
    });
    expect(javaRepo.signals.languageMatch).toBeDefined();

    const jsRepo = evaluateSkillProjectMatch(skill, {
      repositoryName: "react-app",
      description: null,
      primaryLanguage: "JavaScript",
      languageBreakdown: { JavaScript: 88, CSS: 12 },
      topics: [],
      dependencies: [],
    });
    expect(jsRepo.signals.languageMatch).toBeUndefined();
    expect(jsRepo.confidence).toBe("low");
  });
});