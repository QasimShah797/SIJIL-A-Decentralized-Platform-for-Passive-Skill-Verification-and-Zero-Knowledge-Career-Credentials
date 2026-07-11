import { z } from "zod";
import { WALLET_SHARE_FIELD_IDS } from "../types/wallet.types";

export const competencyIdParamSchema = z.object({
  competencyId: z.string().uuid(),
});

export const shareIdParamSchema = z.object({
  shareId: z.string().uuid(),
});

export const presentationTokenParamSchema = z.object({
  token: z.string().min(16),
});

export const shareWalletCompetencySchema = z.object({
  selectionMode: z.enum([
    "basic_summary",
    "verification_summary",
    "complete_evidence_package",
    "custom",
  ]),
  selectedFields: z.array(z.enum(WALLET_SHARE_FIELD_IDS)).min(1),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

export const verifyPresentationSchema = z.object({
  disclosedPayload: z.record(z.string(), z.unknown()).optional(),
});
