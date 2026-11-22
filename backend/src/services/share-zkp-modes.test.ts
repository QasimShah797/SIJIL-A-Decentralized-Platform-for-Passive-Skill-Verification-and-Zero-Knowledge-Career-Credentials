/**
 * Share evidence-mode behavior for Moodle/Peer private proofs and leak checks.
 * Uses real Groth16 artifacts. Does not hit Supabase for Moodle/Peer paths.
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildShareZkpAttachment,
  assertNoPrivateWitnessLeak,
  moodleCompletionCounts,
  countEligiblePeerReviews,
  isMoodleAssignmentCompleted,
  isEligiblePeerReview,
} from "./share-zkp.service";
import type { WalletCompetencyRecordView } from "../types/wallet.types";
import { resolveMoodleZkpArtifactDir } from "./moodle-zkp-artifacts";
import { resolvePeerZkpArtifactDir } from "./peer-zkp-artifacts";

const LEARNER = "123e4567-e89b-42d3-a456-426614174000";
const COMPETENCY = "323e4567-e89b-42d3-a456-426614174222";

after(async () => {
  const curve = (globalThis as { curve_bn128?: { terminate?: () => Promise<void> } }).curve_bn128;
  if (curve?.terminate) await curve.terminate();
});

function baseRecord(overrides: Partial<WalletCompetencyRecordView> = {}): WalletCompetencyRecordView {
  return {
    competencyId: COMPETENCY,
    competencyName: "Typescript",
    domain: "Programming",
    status: "In Wallet",
    evidencePackage: {
      practicalTask: { latestAttempt: null, history: [] },
      github: { repos: [], activities: [], reviews: [] },
      lms: {
        courses: [],
        assignments: [
          { name: "A1", status: "completed" },
          { name: "A2", status: "submitted" },
          { name: "A3", status: "incomplete" },
          { name: "A4", status: "incomplete" },
        ],
      },
      peerReviews: [
        { status: "completed", reviewStatus: "submitted" },
        { status: "pending", reviewStatus: "pending" },
      ],
    },
    ...overrides,
  } as WalletCompetencyRecordView;
}

describe("moodle / peer eligibility helpers", () => {
  it("counts Moodle Graded submission_status as completed", () => {
    assert.equal(isMoodleAssignmentCompleted({ submission_status: "Graded" }), true);
    assert.equal(isMoodleAssignmentCompleted({ submission_status: "notgraded" }), false);
    assert.equal(isMoodleAssignmentCompleted({ submission_status: "notgraded", submitted_at: "2026-01-01" }), true);
    const counts = moodleCompletionCounts(baseRecord({
      evidencePackage: {
        practicalTask: { latestAttempt: null, history: [] },
        github: { repos: [], activities: [], reviews: [] },
        lms: {
          courses: [{ fullname: "Java" }],
          assignments: [
            { name: "Java Programming Fundamentals", submission_status: "notgraded" },
            { name: "Smart ATM", submission_status: "Graded", graded_at: "2026-11-17T18:36:30+00:00" },
          ],
        },
        peerReviews: [],
      },
    } as unknown as Partial<WalletCompetencyRecordView>));
    assert.deepEqual(counts, { completed: 1, required: 2 });
  });

  it("excludes rejected, pending, self, and duplicate-ineligible peer reviews", () => {
    assert.equal(isEligiblePeerReview({ status: "reviewed" }), true);
    assert.equal(isEligiblePeerReview({ status: "rejected" }), false);
    assert.equal(isEligiblePeerReview({ status: "pending" }), false);
    assert.equal(isEligiblePeerReview({
      status: "reviewed",
      reviewer_user_id: LEARNER,
      learner_user_id: LEARNER,
    }), false);
    const count = countEligiblePeerReviews(baseRecord({
      evidencePackage: {
        practicalTask: { latestAttempt: null, history: [] },
        github: {
          repos: [],
          activities: [],
          reviews: [
            { id: "g1", origin: "SIJIL Form Review", status: "reviewed", review_text: "solid" },
            { id: "g2", origin: "SIJIL Form Review", status: "rejected", review_text: "no" },
          ],
        },
        lms: { courses: [], assignments: [] },
        peerReviews: [
          { id: "p1", status: "reviewed" },
          { id: "p2", status: "pending" },
          { id: "p3", status: "reviewed", reviewer_user_id: LEARNER, learner_user_id: LEARNER },
        ],
      },
    } as unknown as Partial<WalletCompetencyRecordView>), LEARNER);
    assert.equal(count, 2);
  });
});

describe("share ZKP evidence modes", () => {
  it("omits all private results when modes are omit", async () => {
    const out = await buildShareZkpAttachment({
      userId: LEARNER,
      record: baseRecord(),
      modes: {
        practical_task_result: "omit",
        github_evidence: "omit",
        lms_evidence: "omit",
        peer_reviews: "omit",
      },
    });
    assert.equal(out.privateResults.length, 0);
    assert.equal(out.proofs.length, 0);
  });

  it("proves Moodle and Peer privately with verified Groth16 proofs and no witness leak", async () => {
    assert.ok(resolveMoodleZkpArtifactDir(), "Moodle artifacts required");
    assert.ok(resolvePeerZkpArtifactDir(), "Peer artifacts required");

    const out = await buildShareZkpAttachment({
      userId: LEARNER,
      record: baseRecord(),
      modes: {
        practical_task_result: "omit",
        github_evidence: "omit",
        lms_evidence: "private",
        peer_reviews: "private",
      },
    });

    assert.equal(out.privateResults.length, 2);
    const moodle = out.privateResults.find((r) => r.claimType === "moodle_learning");
    const peer = out.privateResults.find((r) => r.claimType === "peer_review");
    assert.equal(moodle?.status, "confirmed");
    assert.equal(moodle?.label, "Requirement met");
    assert.equal(peer?.status, "confirmed");
    assert.equal(peer?.label, "Requirement met");

    assert.equal(out.proofs.length, 2);
    for (const proof of out.proofs) {
      assert.equal(proof.verified, true);
      assert.equal(proof.publicSignals.length, 2);
      assert.equal(JSON.stringify(proof).includes("blinding"), false);
      assert.equal(JSON.stringify(proof.publicSignals).includes("\"3\""), false); // completed count not leaked as sole signal
    }

    const payload = {
      privateResults: out.privateResults,
      zkProofs: out.proofs,
    };
    assert.doesNotThrow(() => assertNoPrivateWitnessLeak(payload as Record<string, unknown>));
    assert.equal(JSON.stringify(payload).includes("scorePercent"), false);
    assert.equal(JSON.stringify(payload).includes("\"completed\""), false);
  });

  it("proves Moodle from Graded submission_status evidence at 50% policy", async () => {
    assert.ok(resolveMoodleZkpArtifactDir(), "Moodle artifacts required");
    const out = await buildShareZkpAttachment({
      userId: LEARNER,
      record: baseRecord({
        competencyName: "Java",
        evidencePackage: {
          practicalTask: { latestAttempt: null, history: [] },
          github: { repos: [], activities: [], reviews: [] },
          lms: {
            courses: [{ fullname: "Java" }],
            assignments: [
              { name: "Fundamentals", submission_status: "notgraded" },
              { name: "Smart ATM", submission_status: "Graded", graded_at: "2026-11-17T18:36:30+00:00" },
            ],
          },
          peerReviews: [],
        },
      } as unknown as Partial<WalletCompetencyRecordView>),
      modes: {
        practical_task_result: "omit",
        github_evidence: "omit",
        lms_evidence: "private",
        peer_reviews: "omit",
      },
    });
    assert.equal(out.privateResults[0]?.status, "confirmed");
    assert.equal(out.privateResults[0]?.label, "Requirement met");
    assert.equal(out.proofs.length, 1);
    assert.equal(out.proofs[0]?.publicSignals[0], "50");
    assert.equal(JSON.stringify(out.privateResults).includes("Smart ATM"), false);
    assert.equal(JSON.stringify(out.privateResults).includes("completed"), false);
  });

  it("returns unmet for Moodle when completion is below policy", async () => {
    const out = await buildShareZkpAttachment({
      userId: LEARNER,
      record: baseRecord({
        evidencePackage: {
          practicalTask: { latestAttempt: null, history: [] },
          github: { repos: [], activities: [], reviews: [] },
          lms: {
            courses: [],
            assignments: [
              { name: "A1", status: "completed" },
              { name: "A2", status: "incomplete" },
              { name: "A3", status: "incomplete" },
              { name: "A4", status: "incomplete" },
            ],
          },
          peerReviews: [],
        },
      } as unknown as Partial<WalletCompetencyRecordView>),
      modes: {
        practical_task_result: "omit",
        github_evidence: "omit",
        lms_evidence: "private",
        peer_reviews: "omit",
      },
    });
    assert.equal(out.privateResults[0]?.status, "unmet");
    assert.equal(out.privateResults[0]?.label, "Requirement not met");
    assert.equal(out.proofs.length, 0);
  });

  it("returns unavailable for Moodle when no assignments exist", async () => {
    const out = await buildShareZkpAttachment({
      userId: LEARNER,
      record: baseRecord({
        evidencePackage: {
          practicalTask: { latestAttempt: null, history: [] },
          github: { repos: [], activities: [], reviews: [] },
          lms: { courses: [], assignments: [] },
          peerReviews: [],
        },
      } as unknown as Partial<WalletCompetencyRecordView>),
      modes: {
        practical_task_result: "omit",
        github_evidence: "omit",
        lms_evidence: "private",
        peer_reviews: "omit",
      },
    });
    assert.equal(out.privateResults[0]?.status, "unavailable");
    assert.equal(out.privateResults[0]?.label, "Could not confirm");
  });

  it("returns unavailable for Peer when no review evidence exists", async () => {
    const out = await buildShareZkpAttachment({
      userId: LEARNER,
      record: baseRecord({
        evidencePackage: {
          practicalTask: { latestAttempt: null, history: [] },
          github: { repos: [], activities: [], reviews: [] },
          lms: { courses: [], assignments: [] },
          peerReviews: [],
        },
      } as unknown as Partial<WalletCompetencyRecordView>),
      modes: {
        practical_task_result: "omit",
        github_evidence: "omit",
        lms_evidence: "omit",
        peer_reviews: "private",
      },
    });
    assert.equal(out.privateResults[0]?.status, "unavailable");
    assert.equal(out.privateResults[0]?.label, "Could not confirm");
  });

  it("returns unmet for Peer when only rejected/pending reviews exist", async () => {
    const out = await buildShareZkpAttachment({
      userId: LEARNER,
      record: baseRecord({
        evidencePackage: {
          practicalTask: { latestAttempt: null, history: [] },
          github: { repos: [], activities: [], reviews: [] },
          lms: { courses: [], assignments: [] },
          peerReviews: [
            { status: "pending" },
            { status: "rejected" },
            { status: "reviewed", reviewer_user_id: LEARNER, learner_user_id: LEARNER },
          ],
        },
      } as unknown as Partial<WalletCompetencyRecordView>),
      modes: {
        practical_task_result: "omit",
        github_evidence: "omit",
        lms_evidence: "omit",
        peer_reviews: "private",
      },
    });
    assert.equal(out.privateResults[0]?.status, "unmet");
    assert.equal(out.privateResults[0]?.label, "Requirement not met");
    assert.equal(out.proofs.length, 0);
  });

  it("proves Peer from SIJIL form reviews stored under github.reviews", async () => {
    assert.ok(resolvePeerZkpArtifactDir(), "Peer artifacts required");
    const out = await buildShareZkpAttachment({
      userId: LEARNER,
      record: baseRecord({
        evidencePackage: {
          practicalTask: { latestAttempt: null, history: [] },
          github: {
            repos: [],
            activities: [],
            reviews: [
              {
                id: "form-1",
                origin: "SIJIL Form Review",
                status: "reviewed",
                review_text: "Knows the skill",
              },
            ],
          },
          lms: { courses: [], assignments: [] },
          peerReviews: [],
        },
      } as unknown as Partial<WalletCompetencyRecordView>),
      modes: {
        practical_task_result: "omit",
        github_evidence: "omit",
        lms_evidence: "omit",
        peer_reviews: "private",
      },
    });
    assert.equal(out.privateResults[0]?.status, "confirmed");
    assert.equal(out.proofs.length, 1);
    assert.equal(JSON.stringify(out.proofs[0]).includes("Knows the skill"), false);
  });
});
