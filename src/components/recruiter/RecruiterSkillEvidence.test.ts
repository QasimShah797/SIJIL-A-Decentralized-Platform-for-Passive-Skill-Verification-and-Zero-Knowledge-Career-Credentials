import { createElement } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecruiterCompetencyDetail, sharedEvidenceForSkill, type RecruiterSkillCard } from "./RecruiterSkillEvidence";

const card: RecruiterSkillCard = {
  id: "share:python", name: "Python", domain: null, createdAt: "", expiresAt: null,
  competencyId: "python", presentationId: "share", credentialId: null,
  selectedFields: ["github_evidence", "lms_evidence", "practical_task_result", "peer_reviews"],
  payload: {
    competency: { competencyId: "typescript" },
    skills: [{ competencyId: "python", evidence: { lms: { courseCount: 1 } } }],
    evidence: { github: { repos: [{ full_name: "owner/typescript" }] } },
  },
};

describe("candidate shared evidence rows", () => {
  it("shows scoped summary-only evidence and excludes another skill's evidence", () => {
    const result = sharedEvidenceForSkill(card);
    expect(result.categories.map(({ label }) => label)).toEqual(["Moodle Learning"]);
    expect(result.ledger).toEqual([]);
  });

  it("excludes private or omitted evidence even if it appears in the snapshot", () => {
    const result = sharedEvidenceForSkill({
      ...card,
      payload: { ...card.payload, evidenceModes: { lms_evidence: "private" } },
    });
    expect(result.categories).toEqual([]);
  });
});

it("renders only disclosed commit and assessment values in the expanded panels", () => {
  render(createElement(RecruiterCompetencyDetail, {
    section: "evidence",
    card: {
      ...card,
      payload: {
        competency: { competencyId: "python" },
        evidence: {
          github: { repos: [
            { full_name: "owner/python", primary_language: "Python", recruiterMetrics: { syncedCommitCount: 12, lastCommitAt: "2026-11-22T09:00:00Z" } },
            { full_name: "owner/old", commit_count: 99 },
            { full_name: "owner/missing", recruiterMetrics: { syncedCommitCount: null, lastCommitAt: null } },
            { full_name: "owner/withheld", recruiterMetrics: {} },
          ] },
          practicalTask: {
            attemptCount: 3, status: "Passed",
            recruiterMetrics: { correctCount: 17, totalQuestions: 20, assessmentScorePercent: 85 },
          },
        },
      },
    },
  }));
  const table = screen.getByRole("table", { name: "Shared GitHub repositories" });
  expect(within(table).getByText("12")).toBeVisible();
  expect(within(table).queryByText("99")).toBeNull();
  expect(within(table).getAllByText("Not shared").length).toBeGreaterThan(0);
  expect(within(table).getAllByText("Not included in this share")).toHaveLength(2);
  expect(within(table).getAllByText("Unavailable").length).toBeGreaterThan(1);
  expect(screen.queryByText("Passed")).toBeNull();
  expect(screen.getByText("17 / 20")).toBeVisible();
  expect(screen.getByText("85%")).toBeVisible();
  expect(screen.getByText("3")).toBeVisible();
});
