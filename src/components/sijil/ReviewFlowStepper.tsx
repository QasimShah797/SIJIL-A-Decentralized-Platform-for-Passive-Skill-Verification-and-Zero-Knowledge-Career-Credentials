import { PipelineStepper, type PipelineStage } from "@/components/sijil/PipelineStepper";

export type ReviewFlowStep = "identity" | "review" | "done";

export function reviewFlowStages(step: ReviewFlowStep): PipelineStage[] {
  const identityStatus =
    step === "identity" ? "current" : step === "review" || step === "done" ? "complete" : "upcoming";
  const reviewStatus =
    step === "review" ? "current" : step === "done" ? "complete" : "upcoming";
  const doneStatus = step === "done" ? "current" : "upcoming";

  return [
    { id: "identity", label: "Identity", status: identityStatus },
    { id: "review", label: "Review", status: reviewStatus },
    { id: "done", label: "Done", status: doneStatus },
  ];
}

export function ReviewFlowStepper({ step, className }: { step: ReviewFlowStep; className?: string }) {
  return <PipelineStepper stages={reviewFlowStages(step)} className={className} />;
}

export const RATING_LABELS: Record<number, string> = {
  1: "Very low confidence",
  2: "Low confidence",
  3: "Moderate confidence",
  4: "High confidence",
  5: "Very high confidence",
};
