import { describe, expect, it } from "vitest";
import {
  hasMoodleAccessControlWarning,
  isOptionalGradeReportInfoWarning,
  MOODLE_SYNC_WARNING_CODES,
} from "@/lib/moodle-integration";

describe("Moodle sync warning classification", () => {
  it("treats optional grade-report enrichment notes as non-destructive", () => {
    const warnings = [
      'Grade report enrichment unavailable for "Java" (course id 2). Assignment grades and feedback were loaded via Moodle assignment APIs.',
    ];
    expect(isOptionalGradeReportInfoWarning(warnings[0])).toBe(true);
    expect(
      hasMoodleAccessControlWarning(warnings, [
        MOODLE_SYNC_WARNING_CODES.OPTIONAL_GRADE_REPORT_UNAVAILABLE,
      ]),
    ).toBe(false);
    expect(hasMoodleAccessControlWarning(warnings)).toBe(false);
  });

  it("keeps assignment grade permission failures destructive via warningCodes", () => {
    const warnings = [
      "Moodle token lacks permission to read assignment grades. Enable assignment and grade web service permissions in Moodle (mod_assign_get_assignments, mod_assign_get_grades, mod_assign_get_submissions).",
    ];
    expect(
      hasMoodleAccessControlWarning(warnings, [
        MOODLE_SYNC_WARNING_CODES.ASSIGNMENT_GRADE_PERMISSION_DENIED,
      ]),
    ).toBe(true);
  });

  it("keeps legacy assignment grade access-denied strings destructive", () => {
    const warnings = [
      'Grade access denied for "Java Programming Fundamentals" in Java — Moodle token needs assignment/grade permissions.',
    ];
    expect(hasMoodleAccessControlWarning(warnings)).toBe(true);
  });

  it("does not treat legacy optional grade-report strings as destructive", () => {
    const warnings = [
      'gradereport_user_get_grade_items access denied for "Java" (course id 2). Using assignment grade APIs.',
    ];
    expect(isOptionalGradeReportInfoWarning(warnings[0])).toBe(true);
    expect(hasMoodleAccessControlWarning(warnings)).toBe(false);
  });

  it("prefers warningCodes over misleading legacy lacks-permission text when codes say optional-only", () => {
    // Structured codes win: optional-only code set must not toast destructively
    // even if an older payload somehow still included the broad permission string.
    const warnings = [
      "Moodle token lacks permission to read assignment grades. Enable assignment and grade web service permissions in Moodle.",
      'Grade report enrichment unavailable for "Java" (course id 2). Assignment grades and feedback were loaded via Moodle assignment APIs.',
    ];
    expect(
      hasMoodleAccessControlWarning(warnings, [
        MOODLE_SYNC_WARNING_CODES.OPTIONAL_GRADE_REPORT_UNAVAILABLE,
      ]),
    ).toBe(false);
  });

  it("does not suppress unrelated non-permission sync notes", () => {
    const warnings = ["Grade not released yet for \"Java Programming Fundamentals\" in Java"];
    expect(hasMoodleAccessControlWarning(warnings)).toBe(false);
  });
});
