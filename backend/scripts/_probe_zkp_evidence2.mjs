import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const userId = "f0620086-9dbf-4bdf-a743-331111353d3e";

async function q(label, table, filterCol) {
  const { data, error } = await sb.from(table).select("*").eq(filterCol, userId).limit(50);
  console.log(`\n${label} filter=${filterCol} err=${error?.message ?? "null"} count=${data?.length ?? 0}`);
  if (data?.[0]) console.log("sample", JSON.stringify(data[0], null, 2).slice(0, 1500));
  return data ?? [];
}

const skills = await q("skills?", "declared_skills", "user_id");
const skills2 = await q("skills learner?", "declared_skills", "learner_user_id");
// try learner_skills / skills table names
for (const t of ["skills", "learner_skills", "competencies", "user_skills"]) {
  const { data, error } = await sb.from(t).select("*").limit(1);
  console.log(`table ${t}:`, error?.message ?? `ok keys=${data?.[0] ? Object.keys(data[0]).join(",") : "empty"}`);
}

const lms = await q("lms_evidence", "lms_evidence", "user_id");
const assigns = await q("moodle_assignments", "moodle_assignments", "user_id");
const peersU = await q("peer_reviews user_id", "peer_reviews", "user_id");
const peersL = await q("peer_reviews learner_user_id", "peer_reviews", "learner_user_id");

// all moodle assignments for course 2
const { data: allA } = await sb.from("moodle_assignments").select("user_id,moodle_course_id,name,submission_status,competency_tags,moodle_assignment_id").eq("moodle_course_id", 2).limit(30);
console.log("\nassignments for course 2", allA?.length, allA);

// any assignments at all
const { data: anyA, count } = await sb.from("moodle_assignments").select("user_id,name,moodle_course_id,submission_status", { count: "exact" }).limit(20);
console.log("\nany assignments", count, anyA);

// github repos
const { data: repos } = await sb.from("github_repositories").select("*").eq("user_id", userId).limit(20);
console.log("\nrepos by user_id", repos?.length, repos?.map((r) => ({ name: r.full_name, linked: r.linked_skill_id, commits: r.commit_count })));
const { data: repos2 } = await sb.from("github_repositories").select("*").eq("learner_user_id", userId).limit(20);
console.log("repos by learner_user_id", repos2?.length);

// github snapshots any
const { data: snaps } = await sb.from("github_contribution_snapshots").select("*").eq("learner_user_id", userId);
console.log("\nsnaps", snaps?.length, snaps?.map((s) => ({ id: s.id, repo: s.repository_full_name, commitment: String(s.commitment).slice(0, 20) })));

const { data: openings } = await sb.from("github_contribution_openings").select("*").eq("learner_user_id", userId);
console.log("openings", openings?.length, openings?.map((o) => ({ snap: o.snapshot_id, count: o.contribution_count })));

const { data: proofs } = await sb.from("github_contribution_proofs").select("*").eq("learner_user_id", userId);
console.log("proofs", proofs?.length, proofs?.map((p) => ({ thr: p.threshold, snap: p.snapshot_id })));

// peer reviews all for this user any column
const { data: allPeers } = await sb.from("peer_reviews").select("id,user_id,learner_user_id,skill,skill_id,competency_name,status,decision,reviewer_user_id,source").or(`user_id.eq.${userId},learner_user_id.eq.${userId}`).limit(50);
console.log("\npeers combined", allPeers?.length, allPeers);
