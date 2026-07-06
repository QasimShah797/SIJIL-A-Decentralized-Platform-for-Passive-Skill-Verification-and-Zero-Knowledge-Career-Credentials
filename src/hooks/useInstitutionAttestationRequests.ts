import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { fetchInstitutionProfile } from "@/lib/db/institution-profile";
import {
  fetchInstitutionAttestationRequest,
  fetchInstitutionAttestationRequests,
  updateInstitutionAttestationRequest,
  type InstitutionAttestationRequest,
} from "@/lib/db/institution-attestation-requests";
import { institutionMatches, normalizeInstitutionName } from "@/lib/institution-routing";

export function useInstitutionAttestationRequests() {
  const { user } = useAuth();
  const userId = user?.id;
  const [requests, setRequests] = useState<InstitutionAttestationRequest[]>([]);
  const [institutionName, setInstitutionName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [all, profile] = await Promise.all([
        fetchInstitutionAttestationRequests(),
        userId ? fetchInstitutionProfile(userId) : Promise.resolve(null),
      ]);
      const viewerInstitution = normalizeInstitutionName(profile?.institutionName);
      setInstitutionName(viewerInstitution);
      const filtered = all.filter((r) => institutionMatches(r.institutionName, viewerInstitution));
      console.log("Institution requests fetched:", filtered);
      setRequests(filtered);
    } catch (err) {
      console.error("Failed to load institution attestation requests:", err);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const approveRequest = async (id: string) => {
    await updateInstitutionAttestationRequest(id, {
      status: "approved",
      reviewedBy: user?.id,
    });
    await refresh();
  };

  const rejectRequest = async (id: string, feedback?: string) => {
    await updateInstitutionAttestationRequest(id, {
      status: "rejected",
      institutionFeedback: feedback,
      reviewedBy: user?.id,
    });
    await refresh();
  };

  return {
    requests,
    institutionName,
    loading,
    refresh,
    approveRequest,
    rejectRequest,
  };
}

export function useInstitutionAttestationRequest(id?: string) {
  const [request, setRequest] = useState<InstitutionAttestationRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!id) {
      setRequest(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRequest(await fetchInstitutionAttestationRequest(id));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  return { request, loading, refresh };
}
