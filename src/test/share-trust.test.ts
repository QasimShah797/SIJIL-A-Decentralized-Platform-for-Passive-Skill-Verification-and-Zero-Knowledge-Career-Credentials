import { describe, expect, it } from "vitest";
import { buildAtsResume } from "@/lib/public-credential";
import {
  canCreateIssuedOnlyShare,
  isBlockchainVerified,
  resumeImpliesAllSkillsVerified,
  siblingIdsForShareScope,
  skillTrustFromRow,
  skillTrustLabel,
} from "@/lib/share-trust";

const shareToken = "11111111-2222-4333-8444-555555555555";
const typescriptId = "32b45b94-a03b-4692-857f-9d28da0a706a";
const javascriptId = "8b4ea14a-fef4-41da-b043-e73ca1e3c196";

describe("public share trust", () => {
  it("maps issued TypeScript as blockchain verified and JavaScript as not issued", () => {
    const resume = buildAtsResume({
      competency: { competencyId: typescriptId, name: "Typescript" },
      skills: [
        {
          competencyId: typescriptId,
          name: "Typescript",
          primary: true,
          issued: true,
          ledgerStatus: "verified",
          blockchainVerified: true,
          trustLabel: "Blockchain verified",
        },
        {
          competencyId: javascriptId,
          name: "Javascript",
          primary: false,
          issued: false,
          ledgerStatus: "not_found",
          blockchainVerified: false,
          trustLabel: "Not verified / No issued credential",
        },
      ],
    }, shareToken, typescriptId);

    const ts = resume.skills.find((skill) => skill.name === "Typescript");
    const js = resume.skills.find((skill) => skill.name === "Javascript");
    expect(ts?.blockchainVerified).toBe(true);
    expect(js?.blockchainVerified).toBe(false);
    expect(js?.trustLabel).toBe("Not verified / No issued credential");
    expect(resumeImpliesAllSkillsVerified(resume.skills)).toBe(false);
  });

  it("excludes unissued siblings from issued-only share scope", () => {
    expect(siblingIdsForShareScope(
      "issued",
      typescriptId,
      [typescriptId, javascriptId],
      new Set([typescriptId]),
    )).toEqual([]);
    expect(canCreateIssuedOnlyShare(javascriptId, new Set([typescriptId]))).toBe(false);
  });

  it("does not treat ledger_unavailable as blockchain verified", () => {
    expect(isBlockchainVerified("ledger_unavailable")).toBe(false);
    expect(skillTrustLabel({ issued: true, ledgerStatus: "ledger_unavailable" }))
      .toBe("Issued · ledger unavailable");
    expect(skillTrustFromRow({ issued: false, ledgerStatus: "verified" }).blockchainVerified).toBe(false);
    expect(skillTrustFromRow({
      issued: false,
      blockchainVerified: true,
      ledgerStatus: "verified",
    }).blockchainVerified).toBe(false);
  });
});
