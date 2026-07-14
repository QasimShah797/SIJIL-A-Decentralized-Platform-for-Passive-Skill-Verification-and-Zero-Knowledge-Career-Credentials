/**
 * One-off repair runner — uses service role to backfill evidence_records from moodle_assignments.
 * Usage: node scripts/run-moodle-repair.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";

const PROJECT_REF = "nhzvtqpplfruzocframc";
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;

function getServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  }
  const raw = execSync(`npx supabase projects api-keys --project-ref ${PROJECT_REF}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const parsed = JSON.parse(raw);
  const row = parsed.keys?.find((item) => item.id === "service_role");
  if (!row?.api_key) throw new Error("Could not resolve service role key");
  return row.api_key;
}

function normalized(value) {
  return String(value ?? "").trim().toLowerCase();
}

function matchesCompetency(left, right) {
  const a = normalized(left);
  const b = normalized(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function resolveCompetency(skills, { courseName, courseShortname, assignmentName, competencyTags }) {
  for (const skill of skills) {
    if (
      matchesCompetency(courseName, skill.name)
      || matchesCompetency(courseShortname, skill.name)
      || matchesCompetency(assignmentName, skill.name)
      || (Array.isArray(competencyTags) && competencyTags.some((tag) => matchesCompetency(tag, skill.name)))
    ) {
      return skill;
    }
  }
  return null;
}

async function main() {
  const serviceRole = getServiceRoleKey();
  const admin = createClient(SUPABASE_URL, serviceRole);

  const { data: assignmentRows, error: assignmentError } = await admin
    .from("moodle_assignments")
    .select("user_id")
    .limit(1000);
  if (assignmentError) throw assignmentError;

  const userIds = [...new Set((assignmentRows ?? []).map((row) => String(row.user_id)))];
  console.log("[moodle-repair] users with assignments:", userIds.length);

  for (const userId of userIds) {
    const [{ data: skillsRows }, { data: courseRows }, { data: rows }, { data: feedbackRows }] = await Promise.all([
      admin.from("declared_skills").select("id, name").eq("user_id", userId),
      admin.from("moodle_courses").select("moodle_course_id, fullname, shortname, moodle_site_url").eq("user_id", userId),
      admin.from("moodle_assignments").select("moodle_course_id, moodle_assignment_id, name, grade, grade_max, competency_tags, feedback, moodle_site_url, synced_at").eq("user_id", userId),
      admin.from("moodle_feedback").select("moodle_assignment_id, feedback_text").eq("user_id", userId),
    ]);

    const skills = (skillsRows ?? []).map((row) => ({ id: String(row.id), name: String(row.name ?? "") }));
    const coursesById = new Map((courseRows ?? []).map((row) => [Number(row.moodle_course_id), row]));
    const feedbackByAssignment = new Map(
      (feedbackRows ?? [])
        .filter((row) => row.feedback_text)
        .map((row) => [Number(row.moodle_assignment_id), String(row.feedback_text)]),
    );

    for (const row of rows ?? []) {
      const assignmentId = Number(row.moodle_assignment_id);
      const courseId = Number(row.moodle_course_id);
      const course = coursesById.get(courseId);
      const courseName = course?.fullname ? String(course.fullname) : `Course ${courseId}`;
      const assignmentName = row.name ? String(row.name) : `Assignment ${assignmentId}`;
      const matched = resolveCompetency(skills, {
        courseName,
        courseShortname: course?.shortname ? String(course.shortname) : null,
        assignmentName,
        competencyTags: row.competency_tags,
      });

      if (!matched) {
        console.log("[moodle-repair]", assignmentName, "—", "—");
        continue;
      }

      const externalId = `moodle_assignment_${assignmentId}`;
      const grade = row.grade == null ? null : Number(row.grade);
      const gradeMax = row.grade_max == null ? null : Number(row.grade_max);
      const moodleSiteUrl = String(row.moodle_site_url || course?.moodle_site_url || "https://sijil-fyp.moodlecloud.com");
      const teacherFeedback = row.feedback ? String(row.feedback) : feedbackByAssignment.get(assignmentId) ?? null;
      const now = row.synced_at ? String(row.synced_at) : new Date().toISOString();
      const metadata = {
        platform: "Moodle",
        course_name: courseName,
        assignment_name: assignmentName,
        grade,
        grade_max: gradeMax,
        grade_percentage: grade != null && gradeMax != null && gradeMax > 0 ? Math.round((grade / gradeMax) * 100) : null,
        teacher_feedback: teacherFeedback,
        moodle_course_id: courseId,
        moodle_assignment_id: assignmentId,
      };

      const payload = {
        user_id: userId,
        source: "LMS",
        external_id: externalId,
        status: grade != null ? "verified" : "pending",
        description: assignmentName,
        suggested_skill_name: matched.name,
        mapped_skill_id: matched.id,
        metadata,
        repository_name: assignmentName,
        repository_url: moodleSiteUrl,
        sync_date: now,
        last_updated: now,
      };

      const { data: existing } = await admin
        .from("evidence_records")
        .select("id")
        .eq("user_id", userId)
        .eq("external_id", externalId)
        .eq("source", "LMS")
        .maybeSingle();

      let evidenceId = existing?.id ? String(existing.id) : null;
      if (existing?.id) {
        const { data: updated, error } = await admin
          .from("evidence_records")
          .update(payload)
          .eq("id", existing.id)
          .select("id")
          .maybeSingle();
        if (error) {
          console.error("[moodle-repair] update failed:", error.message, assignmentName);
          continue;
        }
        evidenceId = updated?.id ? String(updated.id) : evidenceId;
      } else {
        const { data: inserted, error } = await admin
          .from("evidence_records")
          .insert(payload)
          .select("id")
          .maybeSingle();
        if (error) {
          console.error("[moodle-repair] insert failed:", error.message, assignmentName);
          continue;
        }
        evidenceId = inserted?.id ? String(inserted.id) : null;
      }

      if (evidenceId) {
        await admin.from("skill_evidence_links").upsert(
          {
            user_id: userId,
            skill_id: matched.id,
            evidence_record_id: evidenceId,
            linked_at: now,
          },
          { onConflict: "skill_id,evidence_record_id" },
        );
      }

      console.log("[moodle-repair]", assignmentName, matched.name, evidenceId ?? "—");
    }
  }

  const { data: lmsRows, error: lmsError } = await admin
    .from("evidence_records")
    .select("id, external_id, mapped_skill_id, description")
    .eq("source", "LMS");
  if (lmsError) throw lmsError;
  console.log("[moodle-repair] LMS evidence_records count:", lmsRows?.length ?? 0);
  console.log(JSON.stringify(lmsRows ?? [], null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
