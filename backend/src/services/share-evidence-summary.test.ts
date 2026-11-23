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
import { buildDisclosedPayload } from "./wallet.service";
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
