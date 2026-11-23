import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { fetchLearnerProfileRow, type LearnerProfileRow } from "@/lib/db/learner-profile";
import InstitutionCompleteProfile from "./InstitutionCompleteProfile";
import SelfSignupCompleteProfile from "./SelfSignupCompleteProfile";

export default function CompleteProfile() {
  const { user } = useAuth();
  const userId = user?.id;
  const [profile, setProfile] = useState<LearnerProfileRow | null>();

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void fetchLearnerProfileRow(userId).then((row) => {
      if (active) setProfile(row);
    }, () => {
      if (active) setProfile(null);
    });
    return () => { active = false; };
  }, [userId]);

  if (profile === null) {
    return <p role="alert" className="mx-auto max-w-2xl p-6">Could not load your profile. Refresh this page to try again.</p>;
  }
  if (!profile || profile.user_id !== userId) return <PageSkeleton rows={5} />;
  return profile.institution_id
    ? <InstitutionCompleteProfile initialRow={profile} />
    : <SelfSignupCompleteProfile initialRow={profile} />;
}
