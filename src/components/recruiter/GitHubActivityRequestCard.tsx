/**
 * Legacy recruiter GitHub activity request card.
 * Retired: recruiters inspect learner-shared GitHub private results instead.
 */
export function GitHubActivityRequestCard(_props: { learnerUserId: string }) {
  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-[hsl(var(--sijil-blue)/0.04)] p-4 text-sm text-[#475569]">
      GitHub activity requests are retired. Inspect Private verification on the candidate profile for learner-shared results.
    </div>
  );
}
