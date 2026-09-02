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
  const fullName = typeof user?.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name
    : null;
  return { userId: user?.id, userEmail: user?.email, fullName };
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
  const { userId, userEmail, fullName } = useStableUserIds();
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
      const next = await fetchLearnerProfile(userId, userEmail, fullName);
      publishLearnerProfile(userId, next);
      setProfile(next);
      hasLoadedRef.current = true;
    } finally {
      setLoading(false);
    }
  }, [userId, userEmail, fullName]);

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

let sharedDeclaredSkills: DeclaredSkill[] = [];
let sharedDeclaredSkillsUserId: string | null = null;
const declaredSkillsListeners = new Set<() => void>();

function publishDeclaredSkills(userId: string | null, skills: DeclaredSkill[]) {
  sharedDeclaredSkillsUserId = userId;
  sharedDeclaredSkills = skills;
  declaredSkillsListeners.forEach((listener) => listener());
}

export function useDeclaredSkills() {
  const { userId } = useStableUserIds();
  const [skills, setSkills] = useState<DeclaredSkill[]>(() =>
    userId && sharedDeclaredSkillsUserId === userId ? sharedDeclaredSkills : [],
  );
  const [loading, setLoading] = useState(
    () => !(userId && sharedDeclaredSkillsUserId === userId),
  );
  const hasLoadedRef = useRef(!!(userId && sharedDeclaredSkillsUserId === userId));

  const refresh = useCallback(async () => {
    if (!userId) {
      publishDeclaredSkills(null, []);
      setSkills([]);
      setLoading(false);
      hasLoadedRef.current = false;
      return;
    }
    if (!hasLoadedRef.current) {
      setLoading(true);
    }
    try {
      const next = await fetchDeclaredSkills(userId);
      publishDeclaredSkills(userId, next);
      setSkills(next);
      hasLoadedRef.current = true;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const syncFromShared = () => {
      if (!userId) {
        setSkills([]);
        return;
      }
      if (sharedDeclaredSkillsUserId === userId) {
        setSkills(sharedDeclaredSkills);
      }
    };
    declaredSkillsListeners.add(syncFromShared);
    return () => {
      declaredSkillsListeners.delete(syncFromShared);
    };
  }, [userId]);

  useEffect(() => {
    if (userId && sharedDeclaredSkillsUserId === userId) {
      hasLoadedRef.current = true;
    } else {
      hasLoadedRef.current = false;
    }
    refresh();
  }, [refresh]);

  const addSkill = async (skill: Pick<DeclaredSkill, "name" | "domain" | "description">) => {
    if (!userId) return;
    const created = await insertDeclaredSkill(userId, skill, skills);
    setSkills((s) => {
      const idx = s.findIndex((x) => x.id === created.id);
      const next =
        idx >= 0
          ? s.map((x, i) => (i === idx ? created : x))
          : [...s, created];
      publishDeclaredSkills(userId, next);
      return next;
    });
    return created;
  };

  const removeSkill = async (skillId: string) => {
    if (!userId) return;
    await deleteDeclaredSkill(userId, skillId);
    setSkills((s) => {
      const next = s.filter((x) => x.id !== skillId);
      publishDeclaredSkills(userId, next);
      return next;
    });
  };

  const updateSkill = async (
    skillId: string,
    skill: Pick<DeclaredSkill, "name" | "domain" | "description">,
  ) => {
    if (!userId) return;
    const updated = await updateDeclaredSkill(userId, skillId, skill);
    setSkills((s) => {
      const next = s.map((x) => (x.id === skillId ? updated : x));
      publishDeclaredSkills(userId, next);
      return next;
    });
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
