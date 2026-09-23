import { describe, expect, it } from "vitest";
import {
  attestationFromShared,
  buildCandidateDetail,
  filterActiveSharedCredentials,
  flattenDisclosedPayload,
  isActiveShare,
  mapCredentialShareToView,
  mapWalletShareToView,
  skillEvidenceFromShares,
  type SharedCredentialView,
} from "@/lib/shared-presentation";

const now = Date.parse("2026-09-02T10:00:00.000Z");

function sampleWalletShare(overrides: Partial<SharedCredentialView> = {}): SharedCredentialView {
  return {
    presentationId: "share-1",
    source: "wallet_share",
    title: "React.js",
    subtitle: "Frontend",
    skill: "React.js",
    status: "Active",
    selectedFields: ["competency_name"],
    disclosedFields: [{ id: "competency.name", label: "Name", value: "React.js" }],
    disclosedPayload: { competency: { name: "React.js" } },
    hiddenFieldCount: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2099-10-01T00:00:00.000Z",
    token: null,
    proofType: "SignedSelectiveDisclosure",
    ...overrides,
  };
}

describe("isActiveShare", () => {
  it("keeps non-revoked, non-expired presentations", () => {
    expect(isActiveShare({ expiresAt: "2099-10-01T00:00:00.000Z", now })).toBe(true);
    expect(isActiveShare({ expiresAt: null, now })).toBe(true);
  });

  it("drops revoked presentations even if they have not expired", () => {
    expect(isActiveShare({ revoked: true, expiresAt: "2099-10-01T00:00:00.000Z", now })).toBe(false);
    expect(isActiveShare({ revokedAt: "2026-08-20T00:00:00.000Z", expiresAt: "2099-10-01T00:00:00.000Z", now })).toBe(false);
  });

  it("drops expired presentations", () => {
    expect(isActiveShare({ expiresAt: "2026-08-01T00:00:00.000Z", now })).toBe(false);
  });
});

describe("mapWalletShareToView", () => {
  it("returns only disclosed payload fields and ignores revoked or expired rows", () => {
    const active = mapWalletShareToView({
      id: "wallet-1",
      selected_fields: ["competency_name", "verification_status"],
      disclosed_payload: {
        competency: { name: "PostgreSQL" },
        status: { verificationStatus: "Credential Issued" },
      },
      proof_type: "SignedSelectiveDisclosure",
      expires_at: "2099-12-01T00:00:00.000Z",
      revoked_at: null,
      created_at: "2026-08-01T00:00:00.000Z",
    });

    expect(active?.title).toBe("PostgreSQL");
    expect(active?.disclosedFields.some((field) => field.value === "PostgreSQL")).toBe(true);
    expect(active?.disclosedPayload).not.toHaveProperty("learnerDid");
    expect(active?.token).toBeNull();

    expect(mapWalletShareToView({
      id: "wallet-revoked",
      selected_fields: ["competency_name"],
      disclosed_payload: { competency: { name: "Secret skill" } },
      revoked_at: "2026-08-15T00:00:00.000Z",
      expires_at: "2026-12-01T00:00:00.000Z",
    })).toBeNull();

    expect(mapWalletShareToView({
      id: "wallet-expired",
      selected_fields: ["competency_name"],
      disclosed_payload: { competency: { name: "Expired skill" } },
      revoked_at: null,
      expires_at: "2020-01-01T00:00:00.000Z",
    })).toBeNull();
  });
});

describe("mapCredentialShareToView", () => {
  it("does not surface hidden credential fields", () => {
    const view = mapCredentialShareToView({
      token: "pres-1",
      disclosed_fields: [
        { id: "credentialName", label: "Credential name", value: "React credential" },
        { id: "skill", label: "Skill / achievement", value: "React.js" },
      ],
      hidden_fields: ["Student ID", "Full evidence history"],
      expires_at: "2099-12-01T00:00:00.000Z",
      revoked: false,
      created_at: "2026-08-01T00:00:00.000Z",
    });

    expect(view?.title).toBe("React credential");
    expect(view?.disclosedFields.map((field) => field.id)).toEqual(["credentialName", "skill"]);
    expect(view?.disclosedPayload).not.toHaveProperty("studentId");
    expect(view?.hiddenFieldCount).toBe(2);
  });
});

describe("filterActiveSharedCredentials", () => {
  it("never includes unshared, revoked, or expired credentials in the recruiter view", () => {
    const visible = filterActiveSharedCredentials([
      sampleWalletShare(),
      sampleWalletShare({ presentationId: "expired", expiresAt: "2026-01-01T00:00:00.000Z" }),
      sampleWalletShare({
        presentationId: "empty",
        disclosedFields: [],
        disclosedPayload: {},
      }),
    ], now);

    expect(visible.map((item) => item.presentationId)).toEqual(["share-1"]);
  });
});

describe("buildCandidateDetail", () => {
  it("sets credentialCount from shared presentations only", () => {
    const detail = buildCandidateDetail({
      id: "learner-1",
      name: "Ada Lovelace",
      institution: "CUST",
      reviews: 2,
      sharedCredentials: [
        sampleWalletShare(),
        sampleWalletShare({ presentationId: "expired", expiresAt: "2026-01-01T00:00:00.000Z" }),
      ],
    });

    expect(detail.credentialCount).toBe(1);
    expect(detail.sharedCredentials).toHaveLength(1);
    expect(detail.topSkill).toBe("React.js");
    expect(attestationFromShared(detail.sharedCredentials)).toBe("Partial");
    expect(flattenDisclosedPayload({ competency: { name: "Go" } })[0]?.value).toBe("Go");
  });
});

describe("skillEvidenceFromShares", () => {
  it("does not copy package Moodle onto a skill that has its own empty snapshot", () => {
    const signals = skillEvidenceFromShares([
      sampleWalletShare({
        skill: "Dart",
        selectedFields: ["competency_name", "lms_evidence", "github_evidence"],
        disclosedPayload: {
          competency: { name: "Dart" },
          skills: [
            { name: "Dart", evidence: { github: { repos: [{ full_name: "me/dart-app" }] } } },
            { name: "TypeScript", evidence: { lms: { courses: [{ fullname: "TS 101" }] } } },
          ],
          evidence: {
            lms: { courses: [{ fullname: "TS 101" }] },
            github: { repos: [{ full_name: "me/dart-app" }, { full_name: "me/ts-app" }] },
          },
        },
      }),
    ]);
    const dart = signals.find((item) => item.skill === "Dart");
    const ts = signals.find((item) => item.skill === "TypeScript");
    expect(dart?.lmsRecords).toBe(0);
    expect(dart?.githubRecords).toBeGreaterThan(0);
    expect(ts?.lmsRecords).toBeGreaterThan(0);
  });
});
