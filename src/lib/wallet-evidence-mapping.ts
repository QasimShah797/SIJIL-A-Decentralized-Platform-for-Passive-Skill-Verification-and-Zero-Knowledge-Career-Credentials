/**
 * Maps declared_skills + evidence_records into wallet LMS/GitHub buckets.
 * Uses existing tables only — declared_skills, evidence_records, peer_reviews.
 */

export function parseEvidenceMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

export function isLmsSource(value: unknown): boolean {
  return typeof value === "string" && value.trim() === "LMS";
}

export function isGithubSource(value: unknown): boolean {
  return !isLmsSource(value);
}

export function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function asNullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function evidenceRecordMatchesSkill(
  row: Record<string, unknown>,
  skillId: string,
): boolean {
  return asText(row.mapped_skill_id) === skillId;
}

export function splitEvidenceRecordsBySource(rows: Record<string, unknown>[]) {
  const normalized = rows.map((row) => ({
    ...row,
    metadata: parseEvidenceMetadata(row.metadata),
  }));

  return {
    github: normalized.filter((row) => isGithubSource(row.source)),
    lms: normalized.filter((row) => isLmsSource(row.source)),
  };
}

export function buildLmsBundleFromEvidenceRecords(
  lmsRecords: Record<string, unknown>[],
  skillId: string,
) {
  const matched = lmsRecords.filter((row) => evidenceRecordMatchesSkill(row, skillId));

  const evidence = matched.map((row) => {
    const metadata = parseEvidenceMetadata(row.metadata);
    const grade = metadata.grade;
    const gradeMax = metadata.grade_max;
    const gradeFormatted = grade != null && gradeMax != null ? `${grade}/${gradeMax}` : null;

    return {
      id: asText(row.id),
      source: "LMS",
      course_name: asNullableText(metadata.course_name) ?? asText(row.description),
      assignment_name: asNullableText(metadata.assignment_name) ?? asText(row.description),
      grade: gradeFormatted ?? grade,
      text_preview: asNullableText(metadata.assignment_name) ?? asText(row.description),
      fetched_at: asNullableText(row.sync_date) ?? asNullableText(row.last_updated),
      metadata,
    };
  });

  const courses = matched.map((row) => {
    const metadata = parseEvidenceMetadata(row.metadata);
    const courseId = metadata.moodle_course_id;
    return {
      moodle_course_id: courseId,
      fullname: asNullableText(metadata.course_name) ?? "LMS Course",
      shortname: null,
      synced_at: asNullableText(row.sync_date) ?? asNullableText(row.last_updated),
    };
  });

  const assignments = matched.map((row) => {
    const metadata = parseEvidenceMetadata(row.metadata);
    const grade = metadata.grade;
    const gradeMax = metadata.grade_max;
    return {
      moodle_assignment_id: metadata.moodle_assignment_id,
      moodle_course_id: metadata.moodle_course_id,
      name: asNullableText(metadata.assignment_name) ?? asText(row.description),
      grade,
      grade_max: gradeMax,
      grade_formatted: grade != null && gradeMax != null ? `${grade}/${gradeMax}` : null,
      feedback: asNullableText(metadata.teacher_feedback),
      synced_at: asNullableText(row.sync_date) ?? asNullableText(row.last_updated),
    };
  });

  const teacherFeedback = matched
    .map((row) => {
      const metadata = parseEvidenceMetadata(row.metadata);
      const text = asNullableText(metadata.teacher_feedback);
      if (!text) return null;
      return {
        source: "Moodle Teacher Feedback",
        feedback_text: text,
        reviewed_at: asNullableText(row.sync_date) ?? asNullableText(row.last_updated),
        status: "Available",
        moodle_assignment_id: asText(metadata.moodle_assignment_id),
        evidence_record_id: asText(row.id),
      };
    })
    .filter((row): row is Record<string, unknown> => row !== null);

  return {
    evidence,
    courses,
    assignments,
    teacherFeedback,
  };
}

export function logWalletLoad(params: {
  declaredSkillCount: number;
  lmsEvidenceCount: number;
  matches: Array<{ skillName: string; matched: boolean }>;
}): void {
  console.log("[wallet] Declared skills:", params.declaredSkillCount);
  console.log("[wallet] LMS evidence records:", params.lmsEvidenceCount);
  for (const match of params.matches) {
    console.log("[wallet] LMS evidence:", match.skillName, "->", match.matched ? "matched" : "unmatched");
  }
}
