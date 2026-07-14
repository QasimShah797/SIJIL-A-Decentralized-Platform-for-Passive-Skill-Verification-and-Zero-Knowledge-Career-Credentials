export function normalizedCompetencyText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function matchesCompetency(value: unknown, competencyName: string): boolean {
  const left = normalizedCompetencyText(value);
  const right = normalizedCompetencyText(competencyName);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export function matchesCompetencyTags(tags: unknown, competencyName: string): boolean {
  if (!Array.isArray(tags)) return false;
  return tags.some((tag) => {
    if (typeof tag === "string") return matchesCompetency(tag, competencyName);
    if (tag && typeof tag === "object") {
      const row = tag as Record<string, unknown>;
      return matchesCompetency(row.name, competencyName)
        || matchesCompetency(row.shortname, competencyName)
        || matchesCompetency(row.label, competencyName);
    }
    return false;
  });
}

export function lmsEvidenceMatchesSkill(
  row: Record<string, unknown>,
  skillId: string,
  skillName: string,
): boolean {
  if (String(row.linked_skill_id ?? "") === skillId) return true;
  return matchesCompetency(row.course_name, skillName)
    || matchesCompetency(row.course_code, skillName)
    || matchesCompetency(row.text_preview, skillName);
}

export function importedLmsMatchesSkill(
  row: Record<string, unknown>,
  skillName: string,
): boolean {
  return matchesCompetency(row.course_name, skillName)
    || matchesCompetency(row.activity_name, skillName);
}

export function moodleAssignmentMatchesSkill(
  row: Record<string, unknown>,
  skillName: string,
): boolean {
  return matchesCompetencyTags(row.competency_tags, skillName)
    || matchesCompetency(row.name, skillName);
}

export function moodleCourseMatchesSkill(
  row: Record<string, unknown>,
  skillName: string,
): boolean {
  return matchesCompetency(row.fullname, skillName)
    || matchesCompetency(row.shortname, skillName);
}

export function isLmsPeerReviewRow(row: Record<string, unknown>): boolean {
  const source = typeof row.source === "string" ? row.source.trim() : "";
  if (source === "LMS") return true;
  const normalizedSource = normalizedCompetencyText(row.source);
  const origin = normalizedCompetencyText(row.origin);
  const role = normalizedCompetencyText(row.reviewer_role);
  return normalizedSource.includes("lms")
    || normalizedSource.includes("moodle")
    || origin.includes("moodle")
    || role.includes("teacher feedback")
    || role.includes("lms instructor");
}

export type AggregatedLmsEvidence = {
  evidence: Record<string, unknown>[];
  courses: Record<string, unknown>[];
  assignments: Record<string, unknown>[];
  grades: Record<string, unknown>[];
  importedEvidence: Record<string, unknown>[];
  teacherFeedback: Record<string, unknown>[];
};

function dedupeByKey<T extends Record<string, unknown>>(
  items: T[],
  getKey: (item: T) => string,
): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
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
      return null;
    }
  }
  return null;
}

function isLmsEvidenceRecord(row: Record<string, unknown>): boolean {
  return typeof row.source === "string" && row.source.trim() === "LMS";
}

export function aggregateLmsEvidenceForCompetency(
  competencyId: string,
  competencyName: string,
  params: {
    lmsEvidence: Record<string, unknown>[];
    moodleCourses: Record<string, unknown>[];
    moodleAssignments: Record<string, unknown>[];
    moodleGrades: Record<string, unknown>[];
    moodleFeedback: Record<string, unknown>[];
    importedLmsEvidence: Record<string, unknown>[];
    lmsEvidenceRecords?: Record<string, unknown>[];
  },
): AggregatedLmsEvidence {
  const coursesById = new Map<string, Record<string, unknown>>();
  for (const course of params.moodleCourses) {
    const courseId = asText(course.moodle_course_id);
    if (courseId) coursesById.set(courseId, course);
  }

  const matchingAssignments = dedupeByKey(
    params.moodleAssignments.filter((row) => {
      const course = coursesById.get(asText(row.moodle_course_id));
      return moodleAssignmentMatchesSkill(row, competencyName)
        || (course ? moodleCourseMatchesSkill(course, competencyName) : false);
    }),
    (row) => asText(row.moodle_assignment_id),
  );

  const assignmentIds = new Set(
    matchingAssignments.map((row) => asText(row.moodle_assignment_id)).filter(Boolean),
  );

  const courseIds = new Set(
    matchingAssignments.map((row) => asText(row.moodle_course_id)).filter(Boolean),
  );

  for (const course of params.moodleCourses) {
    if (moodleCourseMatchesSkill(course, competencyName)) {
      courseIds.add(asText(course.moodle_course_id));
    }
  }

  const importedEvidence = dedupeByKey(
    params.importedLmsEvidence.filter((row) => {
      const assignmentId = asText(row.moodle_assignment_id);
      const courseId = asText(row.moodle_course_id);
      return (
        (assignmentId && assignmentIds.has(assignmentId))
        || (courseId && courseIds.has(courseId))
        || importedLmsMatchesSkill(row, competencyName)
      );
    }),
    (row) => asText(row.id) || asText(row.moodle_assignment_id),
  );

  for (const row of importedEvidence) {
    const courseId = asText(row.moodle_course_id);
    const assignmentId = asText(row.moodle_assignment_id);
    if (courseId) courseIds.add(courseId);
    if (assignmentId) assignmentIds.add(assignmentId);
  }

  const evidenceFromRecords = (params.lmsEvidenceRecords ?? [])
    .filter((row) =>
      isLmsEvidenceRecord(row)
      && (
        asText(row.mapped_skill_id) === competencyId
        || asText(row.suggested_skill_id) === competencyId
      ),
    )
    .map((row) => {
      const metadata = asRecord(row.metadata) ?? {};
      const grade = metadata.grade;
      const gradeMax = metadata.grade_max;
      const gradeFormatted = grade != null && gradeMax != null ? `${grade}/${gradeMax}` : null;
      return {
        id: asText(row.id),
        linked_skill_id: competencyId,
        source: "LMS",
        course_name: asNullableText(metadata.course_name) ?? asText(row.repository_name),
        course_code: null,
        grade: gradeFormatted ?? grade,
        completion_status: asNullableText(row.status),
        text_preview: asNullableText(metadata.assignment_name) ?? asNullableText(row.description),
        fetched_at: asNullableText(row.sync_date) ?? asNullableText(row.last_updated),
        evidence_hash: asNullableText(row.external_id),
        moodle_site_url: asNullableText(row.repository_url),
        metadata,
      };
    });

  for (const row of evidenceFromRecords) {
    const metadata = asRecord(row.metadata) ?? {};
    const assignmentId = asText(metadata.moodle_assignment_id);
    const courseId = asText(metadata.moodle_course_id);
    if (assignmentId) assignmentIds.add(assignmentId);
    if (courseId) courseIds.add(courseId);
  }

  const assignmentsFromRecords = (params.lmsEvidenceRecords ?? [])
    .filter((row) =>
      isLmsEvidenceRecord(row)
      && asText(row.mapped_skill_id) === competencyId,
    )
    .map((row) => {
      const metadata = asRecord(row.metadata) ?? {};
      const grade = metadata.grade;
      const gradeMax = metadata.grade_max;
      return {
        moodle_assignment_id: metadata.moodle_assignment_id,
        moodle_course_id: metadata.moodle_course_id,
        name: metadata.assignment_name ?? row.description,
        grade,
        grade_max: gradeMax,
        grade_formatted: grade != null && gradeMax != null ? `${grade}/${gradeMax}` : null,
        feedback: metadata.teacher_feedback,
        synced_at: row.sync_date,
      };
    });

  const evidence = dedupeByKey(
    [
      ...params.lmsEvidence.filter((row) => lmsEvidenceMatchesSkill(row, competencyId, competencyName)),
      ...evidenceFromRecords,
    ],
    (row) => asText(row.id) || `${asText(row.course_name)}:${asText(row.course_code)}`,
  );

  const courses = dedupeByKey(
    [
      ...params.moodleCourses.filter((row) => courseIds.has(asText(row.moodle_course_id))),
      ...evidenceFromRecords.map((row) => {
        const metadata = asRecord(row.metadata) ?? {};
        return {
          moodle_course_id: metadata.moodle_course_id,
          fullname: asNullableText(metadata.course_name) ?? asText(row.course_name),
          shortname: asNullableText(metadata.course_shortname),
          synced_at: asNullableText(row.fetched_at),
        };
      }),
    ],
    (row) => asText(row.moodle_course_id) || asText(row.fullname),
  );

  const assignments = dedupeByKey(
    [
      ...params.moodleAssignments.filter((row) =>
        assignmentIds.has(asText(row.moodle_assignment_id))
        || courseIds.has(asText(row.moodle_course_id)),
      ),
      ...assignmentsFromRecords,
    ],
    (row) => asText(row.moodle_assignment_id),
  );

  const grades = dedupeByKey(
    params.moodleGrades.filter((row) => courseIds.has(asText(row.moodle_course_id))),
    (row) => `${asText(row.moodle_course_id)}:${asText(row.item_id)}`,
  );

  const feedbackFromTable = params.moodleFeedback
    .filter((row) => assignmentIds.has(asText(row.moodle_assignment_id)))
    .map((row) => ({
      source: "Moodle Teacher Feedback",
      feedback_text: asNullableText(row.feedback_text),
      reviewed_at: asNullableText(row.synced_at) ?? asNullableText(row.created_at),
      status: "Available",
      moodle_assignment_id: asText(row.moodle_assignment_id),
    }));

  const feedbackFromAssignments = assignments
    .filter((row) => {
      const assignmentId = asText(row.moodle_assignment_id);
      const text = asNullableText(row.feedback);
      if (!text) return false;
      return !feedbackFromTable.some((item) => asText(item.moodle_assignment_id) === assignmentId);
    })
    .map((row) => ({
      source: "Moodle Teacher Feedback",
      feedback_text: asNullableText(row.feedback),
      reviewed_at: asNullableText(row.graded_at) ?? asNullableText(row.synced_at),
      status: "Available",
      moodle_assignment_id: asText(row.moodle_assignment_id),
    }));

  const feedbackFromEvidenceRecords = (params.lmsEvidenceRecords ?? [])
    .filter((row) =>
      isLmsEvidenceRecord(row)
      && asText(row.mapped_skill_id) === competencyId,
    )
    .map((row) => {
      const metadata = asRecord(row.metadata) ?? {};
      const text = asNullableText(metadata.teacher_feedback) ?? asNullableText(metadata.feedback);
      if (!text) return null;
      return {
        source: "Moodle Teacher Feedback",
        feedback_text: text,
        reviewed_at: asNullableText(metadata.graded_at) ?? asNullableText(row.sync_date),
        status: "Available",
        moodle_assignment_id: asText(metadata.moodle_assignment_id),
        evidence_record_id: asText(row.id),
      };
    })
    .filter((row): row is Record<string, unknown> => row !== null);

  const teacherFeedback = dedupeByKey(
    [...feedbackFromTable, ...feedbackFromAssignments, ...feedbackFromEvidenceRecords],
    (row) => `${asText(row.moodle_assignment_id)}:${asText(row.reviewed_at)}:${asText(row.feedback_text).slice(0, 32)}`,
  );

  return {
    evidence,
    courses,
    assignments,
    grades,
    importedEvidence,
    teacherFeedback,
  };
}
