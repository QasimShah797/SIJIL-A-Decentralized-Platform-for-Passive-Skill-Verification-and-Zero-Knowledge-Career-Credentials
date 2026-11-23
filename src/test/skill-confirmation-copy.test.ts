import { describe, expect, it } from "vitest";
import {
  CONFIRMED_LABEL,
  displaySkillStatusValue,
  NOT_CONFIRMED_LABEL,
  SKILL_CONFIRMED_LABEL,
  UNDER_REVIEW_LABEL,
} from "@/lib/skill-confirmation-copy";

describe("skill confirmation copy", () => {
  it("does not show Confirmed for unverified or pending states", () => {
    expect(displaySkillStatusValue("Unverified")).toBe(NOT_CONFIRMED_LABEL);
    expect(displaySkillStatusValue("Verification Pending")).toBe(UNDER_REVIEW_LABEL);
    expect(displaySkillStatusValue("Pending Review")).toBe(UNDER_REVIEW_LABEL);
  });

  it("maps confirmed skill states", () => {
    expect(displaySkillStatusValue("verified")).toBe(SKILL_CONFIRMED_LABEL);
    expect(displaySkillStatusValue("Competency verified")).toBe(SKILL_CONFIRMED_LABEL);
    expect(displaySkillStatusValue("Approved")).toBe(CONFIRMED_LABEL);
  });
});