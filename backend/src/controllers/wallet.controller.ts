import { Request, Response } from "express";
import { sendSuccess } from "../utils/apiResponse";
import { walletService } from "../services/wallet.service";
import { runWithUserDb } from "../config/supabase";
import {
  competencyIdParamSchema,
  presentationTokenParamSchema,
  shareIdParamSchema,
  shareWalletCompetencySchema,
  verifyPresentationSchema,
} from "../validators/wallet.validator";

export async function getWalletCompetencies(req: Request, res: Response): Promise<Response> {
  const records = await runWithUserDb(req.accessToken, () => walletService.getCompetencies(req.user!.id));
  return sendSuccess(res, records);
}

export async function getWalletCompetency(req: Request, res: Response): Promise<Response> {
  const { competencyId } = competencyIdParamSchema.parse(req.params);
  const detail = await runWithUserDb(req.accessToken, () =>
    walletService.getCompetency(req.user!.id, competencyId),
  );
  return sendSuccess(res, detail);
}

export async function syncWalletCompetency(req: Request, res: Response): Promise<Response> {
  const { competencyId } = competencyIdParamSchema.parse(req.params);
  const record = await runWithUserDb(req.accessToken, () =>
    walletService.syncCompetency(req.user!.id, competencyId),
  );
  return sendSuccess(res, record, "Competency wallet record synced");
}

export async function shareWalletCompetency(req: Request, res: Response): Promise<Response> {
  const { competencyId } = competencyIdParamSchema.parse(req.params);
  const input = shareWalletCompetencySchema.parse(req.body);
  const result = await runWithUserDb(req.accessToken, () =>
    walletService.shareCompetency(req.user!.id, competencyId, input),
  );
  return sendSuccess(res, result, "Selective disclosure presentation created", 201);
}

export async function revokeWalletShare(req: Request, res: Response): Promise<Response> {
  const { shareId } = shareIdParamSchema.parse(req.params);
  await runWithUserDb(req.accessToken, () => walletService.revokeShare(req.user!.id, shareId));
  return sendSuccess(res, null, "Presentation revoked");
}

export async function getPublicPresentation(req: Request, res: Response): Promise<Response> {
  const { token } = presentationTokenParamSchema.parse(req.params);
  const presentation = await walletService.getPublicPresentation(token);
  return sendSuccess(res, presentation);
}

export async function verifyPublicPresentation(req: Request, res: Response): Promise<Response> {
  const { token } = presentationTokenParamSchema.parse(req.params);
  const input = verifyPresentationSchema.parse(req.body ?? {});
  const result = await walletService.verifyPublicPresentation(token, input.disclosedPayload);
  return sendSuccess(res, result);
}
