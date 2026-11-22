import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PracticalTaskCard } from "@/components/practical-tasks/PracticalTasksPagePanels";
import { ValidationTrailCard } from "@/components/validation/ValidationPagePanels";
import { supabase } from "@/integrations/supabase/client";
import type { McqAttemptResultRow } from "@/lib/db/practical-attempts";
import { buildValidationSummary } from "@/lib/db/validation";
import type { DeclaredSkill } from "@/lib/sijil-data";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/lib/db/credentials", () => ({ fetchCredentials: async () => [] }));

const skill: DeclaredSkill = {
  id: "typescript",
  name: "TypeScript",
  domain: "Development",
  status: "Evidence Linked",
  description: "",
  pipelineStage: "evidence_linked",
  lastRelatedActivityAt: null,
  lastCredentialSyncAt: null,
};

const completedAttempt = {
  id: "attempt-1",
  learner_user_id: "learner-1",
  skill_id: skill.id,
  competency_name: skill.name,
  competency_domain: skill.domain,
  title: null,
  status: "completed",
  percentage: 10,
  correct_count: 1,
  total_questions: 10,
  passed: false,
  submitted_at: "2026-11-21T12:00:00Z",
  created_at: "2026-11-21T11:59:00Z",
} satisfies McqAttemptResultRow & { learner_user_id: string };

type FixtureRow = Record<string, unknown>;

let mcqRows: FixtureRow[];
let legacyRows: FixtureRow[];
let peerRows: FixtureRow[];
const verifiedReview = {
  id: "review-1",
  learner_user_id: "learner-1",
  skill_id: skill.id,
  skill: skill.name,
  context_status: "Context Verified",
  contributor_verification: "Contributor Verified",
  reviewed_at: "2026-11-21T13:00:00Z",
};

beforeEach(() => {
  mcqRows = [];
  legacyRows = [];
  peerRows = [];
  vi.mocked(supabase.from).mockImplementation((table) => {
    let rows = table === "mcq_task_attempts" ? mcqRows : table === "practical_attempts" ? legacyRows : table === "peer_reviews" ? peerRows : [];
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value);
        return query;
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((row) => values.includes(row[column]));
        return query;
      },
      is: (column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value);
        return query;
      },
      order: () => query,
      limit: (count: number) => {
        rows = rows.slice(0, count);
        return query;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (result: { data: FixtureRow[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
    };
    return query as unknown as ReturnType<typeof supabase.from>;
  });
});

const loadProgress = () => buildValidationSummary("learner-1", skill, { includeAssessmentProgress: true });

describe("learner assessment progress", () => {
  it("counts the completed 10% attempt even when a retake is in progress", async () => {
    mcqRows = [{ ...completedAttempt, id: "retake", status: "in_progress" }, completedAttempt];
    const summary = await loadProgress();
    render(<ValidationTrailCard summary={summary} index={0} />);

    expect(screen.getByLabelText("Assessment complete")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.queryByText(/Latest assessment score/)).not.toBeInTheDocument();
    expect(summary.assessmentScore).toBe(10);
    expect(screen.queryByLabelText("Peer Review complete")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Wallet complete")).not.toBeInTheDocument();
  });

  it.each([
    { status: "in_progress" },
    { status: "abandoned" },
    { learner_user_id: "another-learner" },
    { skill_id: "another-competency" },
    { skill_id: null },
  ])("leaves Assessment pending for %o", async (change) => {
    mcqRows = [{ ...completedAttempt, ...change }];
    render(<ValidationTrailCard summary={await loadProgress()} index={0} />);

    expect(screen.getByLabelText("Assessment")).toBeInTheDocument();
    expect(screen.queryByLabelText("Assessment complete")).not.toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.queryByText("10%")).not.toBeInTheDocument();
  });

  it("accepts an exact submitted legacy attempt with a zero score", async () => {
    legacyRows = [{ user_id: "learner-1", skill_id: skill.id, status: "submitted", score: 0 }];
    expect(await loadProgress()).toMatchObject({ assessmentCompleted: true, assessmentScore: 0 });
  });

  it("completes the main Wallet path with no peer review", async () => {
    mcqRows = [completedAttempt];
    const summary = await buildValidationSummary("learner-1", { ...skill, pipelineStage: "in_wallet" }, { includeAssessmentProgress: true });
    const { container } = render(<ValidationTrailCard summary={summary} index={0} />);
    expect(screen.getByLabelText("Wallet complete")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByLabelText("Peer Review optional")).toBeInTheDocument();
    expect(container.querySelector(".cp-peer-branch")).not.toHaveClass("cp-stepper-line--complete");
  });

  it("colors the review node and both dotted segments for an eligible exact review", async () => {
    mcqRows = [completedAttempt];
    peerRows = [verifiedReview];
    const { container } = render(<ValidationTrailCard summary={await loadProgress()} index={0} />);
    expect(screen.getByLabelText("Peer Review complete").parentElement).toHaveClass("cp-peer-node--complete");
    expect(container.querySelector(".cp-peer-branch")).toHaveClass("cp-stepper-line--complete");
    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  it.each([
    { skill_id: "other-competency" },
    { skill_id: null },
    { learner_user_id: "other-learner" },
    { context_status: "Context Pending" },
    { status: "revoked" },
  ])("leaves the optional branch grey for %o", async (change) => {
    peerRows = [{ ...verifiedReview, ...change }];
    const { container } = render(<ValidationTrailCard summary={await loadProgress()} index={0} />);
    expect(screen.getByLabelText("Peer Review optional")).toBeInTheDocument();
    expect(container.querySelector(".cp-peer-branch")).not.toHaveClass("cp-stepper-line--complete");
  });

  it("does not use a legacy passed flag alone for an expired attempt", async () => {
    legacyRows = [{ user_id: "learner-1", skill_id: skill.id, status: "expired_no_submission", passed: true }];
    expect(await loadProgress()).toMatchObject({ assessmentCompleted: false, assessmentScore: null });
  });
});

it("keeps the score, attempt history, result and retake actions on the task card", () => {
  const onView = vi.fn();
  const onRetake = vi.fn();
  render(
    <PracticalTaskCard
      skill={skill}
      index={0}
      taskState="COMPLETED"
      display={{ percentage: 10, passed: false, label: null }}
      history={[completedAttempt]}
      locked={false}
      lastDays={null}
      onStart={vi.fn()}
      onResume={vi.fn()}
      onView={onView}
      onRetake={onRetake}
    />,
  );

  expect(screen.getByRole("heading", { name: "TypeScript Practical Task" })).toBeInTheDocument();
  expect(screen.getAllByText("10%")).toHaveLength(2);
  expect(screen.getByText("Attempt 1")).toBeInTheDocument();
  const history = screen.getByRole("button", { name: "Attempt history (1)" });
  fireEvent.click(history);
  expect(history).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(screen.getByRole("button", { name: "View Result" }));
  fireEvent.click(screen.getByRole("button", { name: "Retake Task" }));
  expect(onView).toHaveBeenCalledOnce();
  expect(onRetake).toHaveBeenCalledOnce();
});
