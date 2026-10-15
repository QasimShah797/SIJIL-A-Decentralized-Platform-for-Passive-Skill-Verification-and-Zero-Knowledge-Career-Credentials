import { describe, expect, it } from "vitest";
import {
  nextStepForAttempt,
  resolveEffectivePipelineStage,
} from "@/lib/competency-pipeline";

describe("resolveEffectivePipelineStage", () => {
  it("shows wallet_ready only from the stored stage or an issued credential", () => {
    expect(resolveEffectivePipelineStage({ pipelineStage: "wallet_ready" }, {})).toBe("wallet_ready");
    expect(resolveEffectivePipelineStage({ pipelineStage: "evidence_linked" }, { inWallet: true })).toBe("in_wallet");
  });

  it("does not treat a passed practical as wallet_ready", () => {
    expect(
      resolveEffectivePipelineStage(
        { pipelineStage: "evidence_linked" },
        { hasEvidence: true, attemptPassed: true },
      ),
    ).toBe("evidence_linked");
    expect(
      resolveEffectivePipelineStage(
        { pipelineStage: "institution_attestation_pending" },
        { attemptPassed: true },
      ),
    ).toBe("institution_attestation_pending");
    expect(
      resolveEffectivePipelineStage(
        { pipelineStage: "declared" },
        { attemptPassed: true, attestationStatus: "Attestation Approved" },
      ),
    ).toBe("declared");
  });

  it("keeps peer review optional and never uses it for wallet_ready", () => {
    expect(
      resolveEffectivePipelineStage(
        { pipelineStage: "evidence_linked" },
        { hasEvidence: true, peerReviewCount: 2 },
      ),
    ).toBe("peer_review");
    expect(
      resolveEffectivePipelineStage(
        { pipelineStage: "evidence_linked" },
        { hasEvidence: true, attemptPassed: true, peerReviewCount: 2 },
      ),
    ).toBe("peer_review");
  });

  it("can show practical_task only while an attempt is in progress", () => {
    expect(
      resolveEffectivePipelineStage(
        { pipelineStage: "evidence_linked" },
        { hasEvidence: true, attemptInProgress: true },
      ),
    ).toBe("practical_task");
  });
});

describe("nextStepForAttempt", () => {
  it("does not tell a passed-but-not-wallet-ready learner to mint a credential", () => {
    expect(
      nextStepForAttempt("evidence_linked", { passed: true, status: "passed" }),
    ).not.toMatch(/wallet/i);
    expect(nextStepForAttempt("wallet_ready", { passed: true })).toMatch(/wallet/i);
  });
});
