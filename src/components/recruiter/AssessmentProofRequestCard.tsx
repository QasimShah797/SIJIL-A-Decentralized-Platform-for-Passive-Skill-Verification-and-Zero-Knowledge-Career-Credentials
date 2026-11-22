/**
 * Legacy recruiter "Request Private Verification" card.
 * Retired: recruiters inspect learner-shared private results instead of requesting new proofs.
 */
export function AssessmentProofRequestCard(_props: {
  shareToken?: string;
  presentationId?: string;
}) {
  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-[hsl(var(--sijil-blue)/0.04)] p-4 text-sm text-[#475569]">
      Private verification requests are retired. Open the candidate profile to inspect proofs the learner already shared.
    </div>
  );
}
