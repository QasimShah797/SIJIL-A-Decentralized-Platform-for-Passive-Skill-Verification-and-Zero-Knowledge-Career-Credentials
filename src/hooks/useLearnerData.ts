import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { fetchLearnerProfile, type LearnerProfileView } from "@/lib/db/learner-profile";
import { fetchDeclaredSkills, insertDeclaredSkill, deleteDeclaredSkill } from "@/lib/db/skills";
import { fetchCredentials, type CredentialView } from "@/lib/db/credentials";
import { fetchPeerReviews } from "@/lib/db/peer-reviews";
import type { DeclaredSkill, PeerReview } from "@/lib/sijil-data";

export function useLearnerProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<LearnerProfileView | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setProfile(null); setLoading(false); return; }
    setLoading(true);
    try {
      setProfile(await fetchLearnerProfile(user.id, user.email));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return { profile, loading, refresh };
}

export function useDeclaredSkills() {
  const { user } = useAuth();
  const [skills, setSkills] = useState<DeclaredSkill[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setSkills([]); setLoading(false); return; }
    setLoading(true);
    try {
      setSkills(await fetchDeclaredSkills(user.id));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const addSkill = async (skill: Pick<DeclaredSkill, "name" | "domain" | "description">) => {
    if (!user) return;
    const created = await insertDeclaredSkill(user.id, skill, skills);
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
    if (!user) return;
    await deleteDeclaredSkill(user.id, skillId);
    setSkills((s) => s.filter((x) => x.id !== skillId));
  };

  return { skills, loading, refresh, addSkill, removeSkill };
}

export function useCredentials() {
  const { user } = useAuth();
  const [credentials, setCredentials] = useState<CredentialView[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setCredentials([]); setLoading(false); return; }
    setLoading(true);
    try {
      setCredentials(await fetchCredentials(user.id));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return { credentials, loading, refresh };
}

export function usePeerReviews() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<PeerReview[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setReviews([]); setLoading(false); return; }
    setLoading(true);
    try {
      setReviews(await fetchPeerReviews(user.id));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return { reviews, loading, refresh };
}
