import { fetchLearnerCommitMetrics } from "./github-sync.service";
import { buildSelectiveDisclosureProof, hashDisclosurePayload } from "./proof.service";
import { hasValidSharedPayloadSignature } from "./shared-zkp-verification";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertEvidenceModesAllowed,
  assessEvidenceShareAvailability,
  resolveShareFieldsForModes,
  sanitizeEvidenceModesForRecord,
  summarizeGithubDetails,
  type EvidenceModes,
} from "./share-evidence-summary";
import type { WalletCompetencyRecordView } from "../types/wallet.types";
import { lmsEvidenceMatchesSkill, matchesCompetency } from "../utils/moodle-evidence-matching";
import { assertNoPrivateWitnessLeak } from "./share-zkp.service";
import { redactExactValues, recruiterShareExactPreferences } from "../utils/exact-value-redaction";
import { DEFAULT_DISCLOSURE_PREFERENCES } from "./disclosure-preferences.service";
import { buildAttemptHistoryItem, buildDisclosedPayload, fetchWalletGithubRepositories } from "./wallet.service";
import { AppError } from "../utils/AppError";

function emptyPackage(): WalletCompetencyRecordView["evidencePackage"] {
  return {
    competency: { id: "c1", name: "Typescript", domain: "General", description: "" },
    learner: { id: "u1", did: null, identityReference: null },
    github: { repos: [], activities: [], evidenceRecords: [], reviews: [] },
    lms: { evidence: [], courses: [], assignments: [], grades: [], importedEvidence: [] },
    practicalTask: { latestAttempt: null, attemptHistory: [] },
    peerReviews: [],
    teacherFeedback: [],
    externalEvidence: [],
    institutionReview: { status: null, feedback: null, reviewedAt: null },
    credentialMetadata: [],
    evidenceTimestamps: {
      github: [],
      lms: [],
      practicalTask: [],
      peerReviews: [],
      teacherFeedback: [],
      externalEvidence: [],
    },
    sourceBadges: [],
    evidenceCount: 0,
    status: {
      taskStatus: null,
      reviewStatus: "Pending Review",
      verificationStatus: "Unverified",
      walletStatus: "Evidence Collected",
    },
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      evidenceCount: 0,
      sourceMetadata: [],
      evidenceHashes: [],
    },
  };
}

function recordFor(
  name: string,
  packageOverrides: Partial<WalletCompetencyRecordView["evidencePackage"]>,
): WalletCompetencyRecordView {
  const evidencePackage = { ...emptyPackage(), ...packageOverrides };
  return {
    id: "w1",
    learnerId: "u1",
    competencyId: "c1",
    competencyName: name,
    domain: "General",
    description: "",
    learnerDid: null,
    learnerIdentityReference: null,
    status: "In Wallet",
    practicalTaskStatus: null,
    taskResult: null,
    verificationStatus: "Credential Issued",
    walletRecordStatus: "In Wallet",
    evidenceCount: 0,
    sourceBadges: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    evidencePackage,
  } as WalletCompetencyRecordView;
}

describe("resolveShareFieldsForModes", () => {
  const base = ["learner_name", "competency_name", "timestamps"];

  it("adds github_evidence when mode is details even if not selected", () => {
    const modes: EvidenceModes = {
      practical_task_result: "private",
      github_evidence: "details",
      lms_evidence: "omit",
      peer_reviews: "omit",
    };
    assert.deepEqual(resolveShareFieldsForModes(base, modes), [
      ...base,
      "github_evidence",
    ]);
  });

  it("never includes private or omit evidence fields", () => {
    const modes: EvidenceModes = {
      practical_task_result: "private",
      github_evidence: "omit",
      lms_evidence: "private",
      peer_reviews: "omit",
    };
    assert.deepEqual(resolveShareFieldsForModes([...base, "github_evidence", "lms_evidence"], modes), base);
  });
});

describe("evidence share availability", () => {
  it("marks Typescript without Moodle/Peer as absent", () => {
    const typescript = recordFor("Typescript", {
      github: {
        repos: [{ full_name: "org/ts", repo_name: "ts" }],
        activities: [],
        evidenceRecords: [],
        reviews: [],
      },
      practicalTask: {
        latestAttempt: {
          attemptId: "a1",
          title: "TS task",
          status: "Passed",
          submittedAt: "2026-11-01T00:00:00Z",
          scorePercent: 90,
          correctCount: 9,
          totalQuestions: 10,
          passed: true,
        },
        attemptHistory: [],
      },
    });
    const avail = assessEvidenceShareAvailability(typescript);
    assert.equal(avail.lms_evidence.present, false);
    assert.equal(avail.peer_reviews.present, false);
    assert.equal(avail.github_evidence.present, true);
    assert.equal(avail.practical_task_result.present, true);
    assert.equal(avail.practical_task_result.privateAllowed, true);
  });

  it("marks Java with Moodle assignments as present and private-capable", () => {
    const java = recordFor("Java", {
      lms: {
        evidence: [],
        courses: [{ fullname: "Java" }],
        assignments: [{ name: "Smart ATM", submission_status: "Graded" }],
        grades: [],
        importedEvidence: [],
      },
    });
    const avail = assessEvidenceShareAvailability(java);
    assert.equal(avail.lms_evidence.present, true);
    assert.equal(avail.lms_evidence.privateAllowed, true);
  });

  it("forces omit for missing evidence and rejects cross-skill share attempts", () => {
    const typescript = recordFor("Typescript", {
      github: {
        repos: [{ full_name: "org/ts", repo_name: "ts" }],
        activities: [],
        evidenceRecords: [],
        reviews: [],
      },
    });
    const sanitized = sanitizeEvidenceModesForRecord({
      practical_task_result: "private",
      github_evidence: "private",
      lms_evidence: "private",
      peer_reviews: "private",
    }, typescript);
    assert.equal(sanitized.lms_evidence, "omit");
    assert.equal(sanitized.peer_reviews, "omit");
    assert.equal(sanitized.github_evidence, "private");
    assert.equal(sanitized.practical_task_result, "omit");

    assert.throws(
      () => assertEvidenceModesAllowed({ lms_evidence: "private" }, typescript),
      (err: unknown) => err instanceof AppError && err.statusCode === 400,
    );
  });

  it("disables private when Moodle courses exist without assignments", () => {
    const record = recordFor("Java", {
      lms: {
        evidence: [],
        courses: [{ fullname: "Java" }],
        assignments: [],
        grades: [],
        importedEvidence: [],
      },
    });
    const avail = assessEvidenceShareAvailability(record);
    assert.equal(avail.lms_evidence.present, true);
    assert.equal(avail.lms_evidence.privateAllowed, false);
    const sanitized = sanitizeEvidenceModesForRecord({ lms_evidence: "private" }, record);
    assert.equal(sanitized.lms_evidence, "details");
  });
});

describe("summarizeGithubDetails", () => {
  it("includes safe repo identities without commit counts", () => {
    const record = {
      evidencePackage: {
        github: {
          repos: [
            {
              full_name: "org/demo",
              repo_name: "demo",
              primary_language: "TypeScript",
              commit_count: 99,
              github_url: "https://github.com/org/demo",
            },
          ],
          activities: [],
        },
      },
    } as unknown as WalletCompetencyRecordView;
    const summary = summarizeGithubDetails(record);
    assert.ok(summary);
    assert.equal(summary.repositoryCount, 1);
    assert.equal(summary.activityCount, 1);
    const repos = summary.repos as Array<Record<string, unknown>>;
    assert.equal(repos[0]?.full_name, "org/demo");
    assert.equal("commit_count" in repos[0]!, false);
    assert.equal(JSON.stringify(summary).includes("99"), false);
  });
});

it("refuses a conflicting Moodle skill link and avoids partial skill names", () => {
  assert.equal(lmsEvidenceMatchesSkill({ linked_skill_id: "python-id", course_name: "TypeScript" }, "typescript-id", "TypeScript"), false);
  assert.equal(matchesCompetency("JavaScript Fundamentals", "Java"), false);
  assert.equal(matchesCompetency("Introduction to Python", "Python"), true);
});

it("shares the credential issue date without exposing evidence timestamps or omitted categories", () => {
  const pkg = emptyPackage();
  const record = recordFor("TypeScript", {
    evidenceTimestamps: { ...pkg.evidenceTimestamps, github: ["2026-11-01T00:00:00Z"] },
    github: { ...pkg.github, repos: [{ full_name: "example/private-repo" }] },
  });
  const issuedAt = "2026-11-24T08:00:00Z";
  const payload = buildDisclosedPayload(record, ["competency_name", "timestamps"], undefined, [], issuedAt);
  assert.deepEqual(payload.timestamps, { credentialIssuedAt: issuedAt });
  assert.equal("evidence" in payload, false);
  assert.equal(JSON.stringify(payload).includes("private-repo"), false);
});

it("snapshots only scoped authored metrics and stored marks, and redacts them at read time", () => {
  const pkg = emptyPackage();
  const latest = buildAttemptHistoryItem({ id: "latest", title: "Assessment", status: "completed", percentage: 85, correct_count: 17, total_questions: 20 });
  assert.ok(latest);
  const repo = { full_name: "owner/python", commit_count: 99, learner_commit_count: 12, learner_last_commit_at: "2026-11-22T09:00:00Z" };
  const commit = { activity_type: "commit", repo_name: "owner/python", commit_hash: "one", occurred_at: "2026-11-22T09:00:00Z" };
  const record = recordFor("Python", {
    github: { ...pkg.github, repos: [repo], activities: [commit, commit, { ...commit, repo_name: "owner/typescript", commit_hash: "two" }] },
    practicalTask: { latestAttempt: latest, attemptHistory: [latest, { ...latest, attemptId: "previous" }] },
  });
  const prefs = { ...DEFAULT_DISCLOSURE_PREFERENCES, shareExactAssessmentMarks: true, shareExactGithubCommitCount: true };
  const snapshot = buildDisclosedPayload(record, ["github_evidence", "practical_task_result"], undefined, [], null, prefs);
  assert.deepEqual(snapshot.evidence, {
    github: { repositoryCount: 1, activityCount: 1, activityRecordsShared: false, summary: "1 linked repository",
      repos: [{ full_name: "owner/python", repo_name: null, primary_language: null, github_url: null,
        recruiterMetrics: { syncedCommitCount: 12, lastCommitAt: repo.learner_last_commit_at } }] },
    practicalTask: { status: "Completed", submittedAt: null, attemptCount: 2,
      recruiterMetrics: { assessmentScorePercent: 85, correctCount: 17, totalQuestions: 20 } },
  });
  assert.doesNotThrow(() => assertNoPrivateWitnessLeak(snapshot));
  const identity = { learnerId: "learner", competencyId: record.competencyId, learnerDid: null, createdAt: "2026-11-23T13:00:00Z", expiresAt: null };
  const payloadHash = hashDisclosurePayload(snapshot);
  const proof = buildSelectiveDisclosureProof({ ...identity, payloadHash });
  const stored = {
    learner_id: identity.learnerId, competency_id: identity.competencyId, created_at: "2026-11-23T13:00:00+00:00",
    proof_value: proof.proofValue, verification_method: proof.verificationMethod, payload_hash: payloadHash,
    expires_at: null, disclosed_payload: JSON.parse(JSON.stringify(snapshot)),
  };
  assert.equal(hasValidSharedPayloadSignature(stored), true);
  assert.equal(hasValidSharedPayloadSignature({ ...stored, disclosed_payload: { ...snapshot, evidence: {} } }), false);
  assert.deepEqual(redactExactValues(stored.disclosed_payload, prefs, "now"), snapshot);
  const olderShare = buildDisclosedPayload(record, ["github_evidence", "practical_task_result"]);
  const reenabled = JSON.stringify(redactExactValues(olderShare, prefs, "now"));
  assert.equal(reenabled.includes("syncedCommitCount"), false);
  assert.equal(reenabled.includes("assessmentScorePercent"), false);
  assert.deepEqual(redactExactValues(snapshot, prefs, "now"), snapshot);
  const withheld = JSON.stringify(redactExactValues(snapshot, DEFAULT_DISCLOSURE_PREFERENCES, "now"));
  for (const key of ["correctCount", "totalQuestions", "assessmentScorePercent", "syncedCommitCount", "lastCommitAt"]) {
    assert.equal(withheld.includes(key), false);
  }
  assert.equal(JSON.stringify(redactExactValues(snapshot, prefs, "now", { omitRecruiterMetrics: true })).includes("recruiterMetrics"), false);
});

it("shares scoped Moodle and peer summaries only when available and selected", () => {
  const pkg = emptyPackage();
  const fields = ["lms_evidence", "peer_reviews"] as const;
  const empty = recordFor("TypeScript", {});
  const python = recordFor("Python", {
    lms: { ...pkg.lms, courses: [{ fullname: "Python Fundamentals" }], assignments: [{ id: "assignment", grade: 82 }] },
    peerReviews: [{ id: "review", review_text: "private feedback" }],
  });
  assert.equal("evidence" in buildDisclosedPayload(empty, [...fields]), false);
  assert.deepEqual(buildDisclosedPayload(python, ["lms_evidence"]).evidence, {
    lms: { courseCount: 1, assignmentCount: 1, gradesShared: false, summary: "Moodle learning overview" },
  });
  assert.deepEqual(buildDisclosedPayload(python, ["peer_reviews"]).evidence, {
    peerReviews: { reviewCount: 1, feedbackShared: false, summary: "Peer reviews on file" },
  });
});

it("uses confirmed per-share evidence choices independently of legacy defaults", () => {
  const evidenceModes = { github_evidence: "details", practical_task_result: "omit" };
  const consent = { evidenceModes, recruiterEvidenceConsent: "selected-details-v1" };
  const payload = {
    ...consent,
    evidence: {
      github: { repos: [{ recruiterMetrics: { syncedCommitCount: 3, lastCommitAt: "2026-11-22T09:00:00Z" } }] },
      practicalTask: { recruiterMetrics: { assessmentScorePercent: 75 } },
    },
  };
  const recruiter = JSON.stringify(redactExactValues(payload, recruiterShareExactPreferences(consent), "now"));
  assert.match(recruiter, /"syncedCommitCount":3/);
  assert.doesNotMatch(recruiter, /assessmentScorePercent|recruiterEvidenceConsent/);
  const assessment = recruiterShareExactPreferences({ evidenceModes: { practical_task_result: "details", github_evidence: "omit" } });
  assert.match(JSON.stringify(redactExactValues(payload, assessment, "now")), /"assessmentScorePercent":75/);
  const bearer = redactExactValues(payload, DEFAULT_DISCLOSURE_PREFERENCES, "now", { omitRecruiterMetrics: true });
  assert.doesNotMatch(JSON.stringify(bearer), /recruiterMetrics|recruiterEvidenceConsent/);
});

it("keeps linked GitHub repositories shareable on a schema without authored metrics", async () => {
  const repo = { id: "repo-id", linked_skill_id: "typescript", full_name: "owner/typescript", commit_count: 99 };
  const queries: string[] = [];
  const result = await fetchWalletGithubRepositories(async (columns) => {
    queries.push(columns);
    return columns.includes("learner_commit_count")
      ? { data: null, error: { code: "42703" } }
      : { data: [repo], error: null };
  });
  assert.equal(queries.length, 2);
  assert.deepEqual(result.data, [repo]);

  const pkg = emptyPackage();
  const record = recordFor("TypeScript", { github: { ...pkg.github, repos: result.data as typeof pkg.github.repos } });
  assert.equal(assessEvidenceShareAvailability(record).github_evidence.present, true);
  const details = summarizeGithubDetails(record, true);
  assert.deepEqual((details?.repos as Array<Record<string, unknown>>)[0]?.recruiterMetrics,
    { syncedCommitCount: null, lastCommitAt: null });
});

it("never treats a GitHub repository permission error as an older schema", async () => {
  const denied = { data: null, error: { code: "42501", message: "permission denied" } };
  let queries = 0;
  assert.equal(await fetchWalletGithubRepositories(async () => { queries++; return denied; }), denied);
  assert.equal(queries, 1);
});

it("uses author-filtered GitHub data in the new share when the repo has no cached metrics", async () => {
  const date = "2026-11-22T09:00:00Z";
  const metrics = await fetchLearnerCommitMetrics("owner/typescript", "learner", {}, async (input) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/repos/owner/typescript/commits");
    assert.equal(url.searchParams.get("author"), "learner");
    assert.equal(url.searchParams.get("per_page"), "1");
    return Response.json([{ commit: { author: { date } } }], {
      headers: { link: '<https://api.github.com/repositories/42/commits?page=6>; rel="last"' },
    });
  });
  const pkg = emptyPackage();
  const record = recordFor("TypeScript", {
    github: { ...pkg.github, repos: [{ full_name: "owner/typescript", commit_count: 99, ...metrics }] },
  });
  const modes = { github_evidence: "details" };
  const exact = recruiterShareExactPreferences({ evidenceModes: modes });
  const payload = buildDisclosedPayload(record, ["github_evidence"], undefined, [], null, exact);
  const recruiter = JSON.stringify(redactExactValues(payload, exact, "now"));
  assert.match(recruiter, /"syncedCommitCount":6/);
  assert.ok(recruiter.includes(date));
  assert.doesNotMatch(recruiter, /commit_count|99/);
});

it("keeps unavailable metrics distinct from a verified zero authored commits", async () => {
  const unavailable = await fetchLearnerCommitMetrics("owner/repo", "learner", {}, async () => new Response(null, { status: 403 }));
  assert.deepEqual(unavailable, { learner_commit_count: null, learner_last_commit_at: null });
  const zero = await fetchLearnerCommitMetrics("owner/repo", "learner", {}, async () => Response.json([]));
  assert.deepEqual(zero, { learner_commit_count: 0, learner_last_commit_at: null });
});
