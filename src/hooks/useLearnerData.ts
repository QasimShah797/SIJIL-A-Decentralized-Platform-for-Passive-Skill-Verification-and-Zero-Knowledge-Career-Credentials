import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { fetchLearnerProfile, type LearnerProfileView } from "@/lib/db/learner-profile";
import { fetchDeclaredSkills, insertDeclaredSkill, deleteDeclaredSkill, updateDeclaredSkill } from "@/lib/db/skills";
import { fetchCredentials, type CredentialView } from "@/lib/db/credentials";
import { fetchPeerReviews } from "@/lib/db/peer-reviews";
import { filterReviewsForDeclaredSkills } from "@/lib/skill-review-filter";
import type { DeclaredSkill, PeerReview } from "@/lib/sijil-data";

function useStableUserIds() {
  const { user } = useAuth();
  return { userId: user?.id, userEmail: user?.email };
}

let sharedLearnerProfile: LearnerProfileView | null = null;
let sharedLearnerProfileUserId: string | null = null;
const learnerProfileListeners = new Set<() => void>();

function publishLearnerProfile(userId: string | null, profile: LearnerProfileView | null) {
  sharedLearnerProfileUserId = userId;
  sharedLearnerProfile = profile;
  learnerProfileListeners.forEach((listener) => listener());
}

export function useLearnerProfile() {
  const { userId, userEmail } = useStableUserIds();
  const [profile, setProfile] = useState<LearnerProfileView | null>(() =>
    userId && sharedLearnerProfileUserId === userId ? sharedLearnerProfile : null,
  );
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      publishLearnerProfile(null, null);
      setProfile(null);
      setLoading(false);
      hasLoadedRef.current = false;
      return;
    }
    if (!hasLoadedRef.current) {
      setLoading(true);
    }
    try {
      const next = await fetchLearnerProfile(userId, userEmail);
      publishLearnerProfile(userId, next);
      setProfile(next);
      hasLoadedRef.current = true;
    } finally {
      setLoading(false);
    }
  }, [userId, userEmail]);

  useEffect(() => {
    const syncFromShared = () => {
      if (!userId) {
        setProfile(null);
        return;
      }
      if (sharedLearnerProfileUserId === userId) {
        setProfile(sharedLearnerProfile);
      }
    };
    learnerProfileListeners.add(syncFromShared);
    return () => {
      learnerProfileListeners.delete(syncFromShared);
    };
  }, [userId]);

  useEffect(() => {
    hasLoadedRef.current = false;
    refresh();
  }, [refresh]);

  return { profile, loading, refresh };
}

export function useDeclaredSkills() {
  const { userId } = useStableUserIds();
  const [skills, setSkills] = useState<DeclaredSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setSkills([]);
      setLoading(false);
      hasLoadedRef.current = false;
      return;
    }
    if (!hasLoadedRef.current) {
      setLoading(true);
    }
    try {
      setSkills(await fetchDeclaredSkills(userId));
      hasLoadedRef.current = true;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    hasLoadedRef.current = false;
    refresh();
  }, [refresh]);

  const addSkill = async (skill: Pick<DeclaredSkill, "name" | "domain" | "description">) => {
    if (!userId) return;
    const created = await insertDeclaredSkill(userId, skill, skills);
    setSkills((s) => {
      const idx = s.findIndex((x) => x.id === created.id);
      if (idx >= 0) {
        const next = [...s];
        next[idx] = created;
        return next;
      }
      return [...s, created];
    });
    return created;
  };

  const removeSkill = async (skillId: string) => {
    if (!userId) return;
    await deleteDeclaredSkill(userId, skillId);
    setSkills((s) => s.filter((x) => x.id !== skillId));
  };

  const updateSkill = async (
    skillId: string,
    skill: Pick<DeclaredSkill, "name" | "domain" | "description">,
  ) => {
    if (!userId) return;
    const updated = await updateDeclaredSkill(userId, skillId, skill);
    setSkills((s) => s.map((x) => (x.id === skillId ? updated : x)));
    return updated;
  };

  return { skills, loading, refresh, addSkill, removeSkill, updateSkill };
}

export function useCredentials() {
  const { userId } = useStableUserIds();
  const [credentials, setCredentials] = useState<CredentialView[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setCredentials([]);
      setLoading(false);
      hasLoadedRef.current = false;
      return;
    }
    if (!hasLoadedRef.current) {
      setLoading(true);
    }
    try {
      setCredentials(await fetchCredentials(userId));
      hasLoadedRef.current = true;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    hasLoadedRef.current = false;
    refresh();
  }, [refresh]);

  return { credentials, loading, refresh };
}

export function usePeerReviews() {
  const { userId } = useStableUserIds();
  const [reviews, setReviews] = useState<PeerReview[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setReviews([]);
      setLoading(false);
      hasLoadedRef.current = false;
      return;
    }
    if (!hasLoadedRef.current) {
      setLoading(true);
    }
    try {
      const [reviews, skills] = await Promise.all([
        fetchPeerReviews(userId),
        fetchDeclaredSkills(userId),
      ]);
      const skillRefs = skills.map((skill) => ({ id: skill.id, name: skill.name }));
      setReviews(filterReviewsForDeclaredSkills(reviews, skillRefs));
      hasLoadedRef.current = true;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    hasLoadedRef.current = false;
    refresh();
  }, [refresh]);

  return { reviews, loading, refresh };
}
