import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LearnerWorkspaceShell } from "@/components/sijil/LearnerWorkspaceShell";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import {
  ValidationEmptyState,
  ValidationFooter,
  ValidationListHero,
  ValidationTrailCard,
} from "@/components/validation/ValidationPagePanels";
import { useDeclaredSkills } from "@/hooks/useLearnerData";
import {
  buildAllValidationSummaries,
  createFallbackValidationSummary,
  type ValidationSummary,
} from "@/lib/db/validation";
import { useAuth } from "@/hooks/useAuth";

export default function Validation() {
  const navigate = useNavigate();
  const { skillId } = useParams<{ skillId?: string }>();
  const { user } = useAuth();
  const { skills, loading: skillsLoading } = useDeclaredSkills();
  const [allSummaries, setAllSummaries] = useState<ValidationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Keep deep links working, but this screen is a non-clickable progress overview.
  useEffect(() => {
    if (skillId) {
      navigate("/learner/validation", { replace: true });
    }
  }, [skillId, navigate]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (skills.length === 0) {
      setAllSummaries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    buildAllValidationSummaries(user.id, skills)
      .then(setAllSummaries)
      .finally(() => setLoading(false));
  }, [user, skills]);

  const listSummaries = useMemo(
    () => (allSummaries.length > 0 ? allSummaries : skills.map(createFallbackValidationSummary)),
    [allSummaries, skills],
  );

  if (skillsLoading || loading) {
    return (
      <LearnerWorkspaceShell variant="dashboard">
        <PageSkeleton rows={4} />
      </LearnerWorkspaceShell>
    );
  }

  return (
    <LearnerWorkspaceShell variant="dashboard">
      <ValidationListHero competencyCount={skills.length} />

      {skills.length === 0 ? (
        <ValidationEmptyState onGoProfile={() => navigate("/learner/profile")} />
      ) : (
        <div className="space-y-4">
          {listSummaries.map((summary, index) => (
            <ValidationTrailCard
              key={summary.skillId}
              summary={summary}
              index={index}
            />
          ))}
        </div>
      )}

      <ValidationFooter />
    </LearnerWorkspaceShell>
  );
}
