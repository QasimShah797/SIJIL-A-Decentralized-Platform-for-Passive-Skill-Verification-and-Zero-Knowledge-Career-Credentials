import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const userId = "f0620086-9dbf-4bdf-a743-331111353d3e";

function show(label, rows) {
  console.log(`\n=== ${label} (${Array.isArray(rows) ? rows.length : rows ? 1 : 0}) ===`);
  console.log(JSON.stringify(rows, null, 2)?.slice(0, 6000));
}

const { data: skills } = await sb.from("declared_skills").select("id, skill_name, name, domain").eq("user_id", userId);
show("declared_skills", skills);

const { data: lms } = await sb
  .from("lms_evidence")
  .select("id, linked_skill_id, course_name, course_code, completion_status, grade, moodle_site_url, source")
  .eq("learner_user_id", userId);
show("lms_evidence", lms);

// try alternate learner column
if (!lms) {
  const { data: lms2, error } = await sb.from("lms_evidence").select("*").limit(5);
  console.log("lms_evidence alt", error?.message, lms2?.[0] && Object.keys(lms2[0]));
}

const { data: courses } = await sb.from("moodle_courses").select("*").eq("learner_user_id", userId).limit(20);
show("moodle_courses", courses);
if (!courses?.length) {
  const { data: c2, error } = await sb.from("moodle_courses").select("*").limit(3);
  console.log("moodle_courses sample keys", error?.message, c2?.[0] && Object.keys(c2[0]));
  const { data: c3 } = await sb.from("moodle_courses").select("*").eq("user_id", userId).limit(20);
  show("moodle_courses by user_id", c3);
}

const { data: assigns } = await sb.from("moodle_assignments").select("*").eq("learner_user_id", userId).limit(30);
show("moodle_assignments", assigns?.map?.((a) => ({
  id: a.moodle_assignment_id,
  course: a.moodle_course_id,
  name: a.name,
  status: a.submission_status,
  tags: a.competency_tags,
  site: a.moodle_site_url,
  learner: a.learner_user_id ?? a.user_id,
})));
if (!assigns?.length) {
  const { data: a2, error } = await sb.from("moodle_assignments").select("*").limit(2);
  console.log("assign keys", error?.message, a2?.[0] && Object.keys(a2[0]));
  const { data: a3 } = await sb.from("moodle_assignments").select("moodle_assignment_id,name,submission_status,competency_tags,moodle_course_id,user_id,learner_user_id").eq("user_id", userId).limit(30);
  show("moodle_assignments by user_id", a3);
}

const { data: peers } = await sb.from("peer_reviews").select("*").or(`reviewee_user_id.eq.${userId},learner_user_id.eq.${userId},reviewee_id.eq.${userId}`).limit(30);
show("peer_reviews", peers);
if (!peers?.length) {
  const { data: p2, error } = await sb.from("peer_reviews").select("*").limit(2);
  console.log("peer keys", error?.message, p2?.[0] && Object.keys(p2[0]));
}

const { data: ghProofs } = await sb
  .from("github_contribution_proofs")
  .select("id, threshold, public_threshold, public_commitment, snapshot_id, created_at, learner_user_id")
  .eq("learner_user_id", userId)
  .order("created_at", { ascending: false })
  .limit(20);
show("github_contribution_proofs", ghProofs);

const { data: snaps } = await sb
  .from("github_contribution_snapshots")
  .select("id, contribution_count, count, verified_count, created_at, learner_user_id")
  .eq("learner_user_id", userId)
  .order("created_at", { ascending: false })
  .limit(10);
show("github_contribution_snapshots", snaps);
if (!snaps?.length) {
  const { data: s2, error } = await sb.from("github_contribution_snapshots").select("*").limit(1);
  console.log("snap keys", error?.message, s2?.[0] && Object.keys(s2[0]));
}

const { data: openings } = await sb
  .from("github_contribution_openings")
  .select("snapshot_id, contribution_count, count, blinding, learner_user_id")
  .eq("learner_user_id", userId)
  .limit(10);
show("github_contribution_openings", openings);
if (!openings?.length) {
  const { data: o2, error } = await sb.from("github_contribution_openings").select("*").limit(1);
  console.log("opening keys", error?.message, o2?.[0] && Object.keys(o2[0]));
}

const { data: repos } = await sb
  .from("github_repositories")
  .select("id, full_name, linked_skill_id, commit_count, learner_user_id, user_id")
  .or(`learner_user_id.eq.${userId},user_id.eq.${userId}`)
  .limit(20);
show("github_repositories", repos);
