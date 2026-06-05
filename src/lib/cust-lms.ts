// LMS evidence: backed by Supabase (lms_evidence table + lms-transcripts bucket).
import { supabase } from "@/integrations/supabase/client";

export type LmsEvidence = {
  id: string;
  user_id: string;
  source: string;
  course_name: string;
  course_code: string | null;
  grade: string | null;
  completion_status: string | null;
  certificate_url: string | null;
  evidence_hash: string;
  raw: unknown;
  linked_skill_id: string | null;
  text_preview: string | null;
  fetched_at: string;
};

// Kept for back-compat with the existing UI card.
export type CustEvidence = {
  id: string;
  course_name: string;
  grade: string;
  completion_status: string;
  source: string;
  verification_status: "Fetched" | "Linked" | "Verified";
  evidence_hash: string;
  fetched_at: string;
  text_preview?: string;
  linked_skill_id?: string | null;
};

export function toCardEvidence(e: LmsEvidence): CustEvidence {
  return {
    id: e.id,
    course_name: e.course_name,
    grade: e.grade ?? "—",
    completion_status: e.completion_status ?? "—",
    source: e.source,
    verification_status: e.linked_skill_id ? "Linked" : "Fetched",
    evidence_hash: e.evidence_hash,
    fetched_at: e.fetched_at,
    text_preview: e.text_preview ?? undefined,
    linked_skill_id: e.linked_skill_id,
  };
}

export async function fetchLmsEvidence(): Promise<LmsEvidence[]> {
  const { data, error } = await supabase
    .from("lms_evidence")
    .select("*")
    .order("fetched_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LmsEvidence[];
}

export async function deleteLmsEvidence(id: string) {
  const { error } = await supabase.from("lms_evidence").delete().eq("id", id);
  if (error) throw error;
}

export async function linkEvidenceToSkillDb(id: string, skillId: string | null) {
  const { error } = await supabase
    .from("lms_evidence")
    .update({ linked_skill_id: skillId })
    .eq("id", id);
  if (error) throw error;
}

export async function syncOdoo(creds: {
  odoo_url: string;
  odoo_db: string;
  odoo_login: string;
  odoo_api_key: string;
}) {
  const { data, error } = await supabase.functions.invoke("lms-odoo-sync", { body: creds });
  if (error) throw error;
  return data as { success: boolean; fetched: number; persisted: number };
}

export async function uploadAndParseTranscript(file: File) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error("Not signed in");
  const path = `${u.user.id}/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, "_")}`;
  const { error: upErr } = await supabase.storage
    .from("lms-transcripts").upload(path, file, { contentType: file.type || "application/pdf" });
  if (upErr) throw upErr;
  const { data, error } = await supabase.functions.invoke("lms-transcript-parse", {
    body: { storage_path: path },
  });
  if (error) throw error;
  return data as { success: boolean; fetched: number; persisted: number };
}

export async function getLmsConnection() {
  const { data, error } = await supabase
    .from("lms_connections").select("*").maybeSingle();
  if (error) throw error;
  return data as null | {
    odoo_url: string | null;
    odoo_db: string | null;
    odoo_login: string | null;
    has_api_key: boolean;
    last_synced_at: string | null;
  };
}
