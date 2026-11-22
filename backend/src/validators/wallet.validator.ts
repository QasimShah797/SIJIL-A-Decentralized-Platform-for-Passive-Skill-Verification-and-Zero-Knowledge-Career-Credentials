import { z } from "zod";
import { WALLET_SHARE_FIELD_IDS } from "../types/wallet.types";

export const competencyIdParamSchema = z.object({
  competencyId: z.string().uuid(),
});

export const shareIdParamSchema = z.object({
  shareId: z.string().uuid(),
});

export const emailPublicShareSchema = z.object({
  recipientEmail: z.string().trim().email("Enter a valid recipient email address."),
  /** Raw share token from link creation; never logged. Must match the stored hash. */
  token: z.string().min(16).max(128),
});

export const presentationTokenParamSchema = z.object({
  token: z.string().min(16),
});

export const publicCompetencyParamSchema = z.object({
  token: z.string().min(16),
  competencyId: z.string().min(1),
});

const evidenceShareModeSchema = z.enum(["details", "private", "omit"]);

export const shareWalletCompetencySchema = z.object({
  selectionMode: z.enum([
    "basic_summary",
    "verification_summary",
    "complete_evidence_package",
    "custom",
  ]),
  selectedFields: z.array(z.enum(WALLET_SHARE_FIELD_IDS)).min(1),
  /** Per-evidence disclosure mode for Share with Recruiter / Public Link. */
  evidenceModes: z.object({
    practical_task_result: evidenceShareModeSchema,
    github_evidence: evidenceShareModeSchema,
    lms_evidence: evidenceShareModeSchema,
    peer_reviews: evidenceShareModeSchema,
  }).optional(),
  shareScope: z.enum(["all", "selected", "issued"]).optional(),
  expiresInDays: z.number().int().positive().max(365).optional(),
  recipientUserId: z.string().uuid().optional(),
  shareAudience: z.literal("all-recruiters").optional(),
  consentToAllRecruiters: z.boolean().optional(),
  competencyVersionIds: z.array(z.string().uuid()).max(20).optional(),
  credentialId: z.string().trim().min(1).max(512).optional(),
}).superRefine((value, ctx) => {
  if (value.shareAudience === "all-recruiters" && value.recipientUserId) {
    ctx.addIssue({
      code: "custom",
      message: "Choose either one recruiter or all recruiters.",
      path: ["shareAudience"],
    });
  }
  if (value.shareAudience === "all-recruiters" && value.consentToAllRecruiters !== true) {
    ctx.addIssue({
      code: "custom",
      message: "Confirm that all registered SIJIL recruiters may see this.",
      path: ["consentToAllRecruiters"],
    });
  }
});

export const verifyPresentationSchema = z.object({
  disclosedPayload: z.record(z.string(), z.unknown()).optional(),
});
