import { describe, expect, it } from "vitest";
import type { CandidateView } from "@/lib/db/candidates";
import { getEvidenceStats, matchedBarPercent } from "@/lib/recruiter-evidence";
import { buildCandidateDetail, type SharedCredentialView } from "@/lib/shared-presentation";

function share(payload: unknown): SharedCredentialView {
  return {
    presentationId: "p1",
    source: "wallet_share",
    title: "Share",
    subtitle: null,
    skill: "TypeScript",
    status: "Active",
    disclosedFields: [],
    selectedFields: [],
    hiddenFieldCount: 0,
    disclosedPayload: payload as SharedCredentialView["disclosedPayload"],
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    token: null,
    proofType: null,
  };
}

describe("getEvidenceStats", () => {
  it("counts evidence records once and ignores commits, files, and copied credentials", () => {
    const record = { id: "gh-1", name: "wallet" };
    const payload = {
      skills: [
        {
          name: "TypeScript",
          evidence: {
            lms: { evidence: [{ id: "lms-1" }, { id: "lms-2" }], courses: [{ id: "course" }], assignments: [{ id: "assignment" }] },
            github: {
              evidenceRecords: [record],
              repos: [{ full_name: "me/app" }],
              activities: Array.from({ length: 400 }, (_, index) => ({ id: `commit-${index}` })),
            },
          },
        },
        {
          name: "Java",
          evidence: {
            github: { evidenceRecords: [record], activities: Array.from({ length: 400 }, (_, index) => ({ id: `file-${index}` })) },
          },
        },
      ],
    };
    const copied = [payload, payload, payload];
    const stats = getEvidenceStats({ disclosedPayloads: copied, credentialCount: copied.length });
    expect(stats.credentials).toBe(3);
    expect(stats.verified).toBe(3);
    expect(stats.corroborating).toBe(1);
    expect(stats.evidenceTotal).toBe(4);
    expect(stats.verified + stats.corroborating).toBe(stats.evidenceTotal);
  });

  it("matches the directory card, match basis, and Review header", () => {
    const payload = {
      skills: [
        { name: "TypeScript", evidence: { lms: { evidence: [{ id: "l1" }] }, github: { evidenceRecords: [{ id: "g1" }, { id: "g2" }] } } },
      ],
    };
    const credential = share(payload);
    const detail = buildCandidateDetail({
      id: "q1",
      name: "Syed Qasim Ali Shah Kazmi",
      institution: "CUST",
      reviews: 0,
      sharedCredentials: [credential, credential],
    });
    const review = getEvidenceStats(detail);
    const directory = getEvidenceStats({
      credentialCount: detail.credentialCount,
      evidenceStats: review,
    } satisfies Partial<CandidateView>);
    expect(review.evidenceTotal).toBe(detail.evidence);
    expect(directory).toEqual(review);
    expect(review.verified + review.corroborating).toBe(review.evidenceTotal);
    expect(review.evidenceTotal).toBe(3);
  });

  it("uses the directory evidence total when the record count is smaller", () => {
    const qasim = {
      credentialCount: 12,
      evidence: 52,
      evidenceStats: { credentials: 12, verified: 5, corroborating: 0, evidenceTotal: 5 },
    };
    const aaiza = {
      credentialCount: 1,
      evidence: 7,
      evidenceStats: { credentials: 1, verified: 0, corroborating: 0, evidenceTotal: 0 },
    };
    const qasimStats = getEvidenceStats(qasim);
    const aaizaStats = getEvidenceStats(aaiza);
    expect(qasimStats.credentials).toBe(12);
    expect(qasimStats.evidenceTotal).toBe(52);
    expect(qasimStats.verified + qasimStats.corroborating).toBe(52);
    expect(aaizaStats.credentials).toBe(1);
    expect(aaizaStats.evidenceTotal).toBe(7);
    const capped = getEvidenceStats({
      credentialCount: 12,
      evidence: 52,
      evidenceStats: { credentials: 12, verified: 2, corroborating: 8, evidenceTotal: 10 },
    });
    expect(capped.evidenceTotal).toBe(52);
    expect(capped.verified + capped.corroborating).toBe(52);
    expect(aaizaStats.verified + aaizaStats.corroborating).toBe(7);
  });

  it("keeps the bar empty when the total is zero", () => {
    expect(matchedBarPercent(6, 6, 0)).toBe(0);
    expect(matchedBarPercent(0, 0, 0)).toBeNull();
    expect(matchedBarPercent(2, 4, 5)).toBe(50);
  });
});
