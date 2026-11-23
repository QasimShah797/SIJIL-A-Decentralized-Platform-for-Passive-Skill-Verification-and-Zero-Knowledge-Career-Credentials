import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssessmentWorkspace } from "./AssessmentWorkspace";
import type { McqQuestion } from "@/lib/mcq-tasks";

const questions: McqQuestion[] = ["first", "second"].map((id) => ({
  id, question: id + " prompt", kind: "concept", difficulty: "easy", type: "single", seconds: 30,
  options: [{ id: "A", text: "One" }, { id: "B", text: "Two" }],
}));

describe("practical assessment workspace", () => {
  it("shows the active question countdown and locks responses at zero", () => {
    const onAnswer = vi.fn();
    const props = {
      skillName: "TypeScript", title: "Assessment", questions, answers: {}, flaggedIds: [],
      evaluating: false, onAnswer, onJump: vi.fn(), onFlag: vi.fn(), onSubmit: vi.fn(), onQuit: vi.fn(),
    };
    const { rerender } = render(<AssessmentWorkspace {...props} currentIndex={0} remainingMs={30_000} expiredIds={[]} />);
    expect(screen.getByRole("timer")).toHaveTextContent("00:30");
    expect(screen.getByText("first prompt")).toBeVisible();

    rerender(<AssessmentWorkspace {...props} currentIndex={0} remainingMs={0} expiredIds={["first"]} />);
    expect(screen.getByRole("button", { name: /A One Select/i })).toBeDisabled();

    rerender(<AssessmentWorkspace {...props} currentIndex={1} remainingMs={30_000} expiredIds={["first"]} />);
    expect(screen.getByRole("timer")).toHaveTextContent("00:30");
    expect(screen.getByText("second prompt")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });
});
