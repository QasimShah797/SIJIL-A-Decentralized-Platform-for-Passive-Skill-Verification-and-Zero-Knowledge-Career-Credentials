import { Request, Response } from "express";
import { sendSuccess } from "../utils/apiResponse";
import { walletService } from "../services/wallet.service";
import { runWithUserDb } from "../config/supabase";
import {
  competencyIdParamSchema,
  presentationTokenParamSchema,
  publicCompetencyParamSchema,
  shareIdParamSchema,
  shareWalletCompetencySchema,
  verifyPresentationSchema,
} from "../validators/wallet.validator";
import { renderAtsResumePdf } from "../services/resume-pdf.service";
import {
  buildApplePkpass,
  buildGoogleWalletLink,
  walletExportAvailability,
} from "../services/wallet-pass.service";
import { AppError } from "../utils/AppError";

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

function resolvePublic<T>(req: Request, fn: () => Promise<T>): Promise<T> {
  return runWithUserDb(req.accessToken, fn);
}

export async function getPublicCredential(req: Request, res: Response): Promise<Response> {
  const { token } = presentationTokenParamSchema.parse(req.params);
  const result = await resolvePublic(req, () => walletService.getPublicCredential(token));
  return sendSuccess(res, result);
}

export async function getPublicResumePhoto(req: Request, res: Response): Promise<void> {
  const { token } = presentationTokenParamSchema.parse(req.params);
  const photo = await resolvePublic(req, () => walletService.getPublicResumePhoto(token));
  if (!photo) {
    throw new AppError("Profile photo is not available for this share", 404);
  }
  res.setHeader("Content-Type", photo.contentType);
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(Buffer.from(photo.bytes));
}

export async function getPublicCompetency(req: Request, res: Response): Promise<Response> {
  const { token, competencyId } = publicCompetencyParamSchema.parse(req.params);
  const result = await resolvePublic(req, () => walletService.getPublicCompetency(token, competencyId));
  return sendSuccess(res, result);
}

export async function getWalletExportConfig(_req: Request, res: Response): Promise<Response> {
  return sendSuccess(res, walletExportAvailability());
}

export async function downloadPublicResumePdf(req: Request, res: Response): Promise<void> {
  const { token } = presentationTokenParamSchema.parse(req.params);
  const credential = await resolvePublic(req, () => walletService.getPublicCredential(token));
  if (credential.status === "revoked") {
    throw new AppError("This credential share has been revoked", 410);
  }
  if (credential.status !== "valid" || !credential.resume) {
    throw new AppError("Resume is not available for this share", 409);
  }
  const pdf = await renderAtsResumePdf(credential.resume, token);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="sijil-resume.pdf"');
  res.setHeader("Cache-Control", "no-store");
  res.send(Buffer.from(pdf));
}

export async function downloadOwnerResumePdf(req: Request, res: Response): Promise<void> {
  const { shareId } = shareIdParamSchema.parse(req.params);
  const exported = await runWithUserDb(req.accessToken, () =>
    walletService.getOwnerShareExport(req.user!.id, shareId),
  );
  if (exported.status === "revoked") {
    throw new AppError("This credential share has been revoked", 410);
  }
  if (exported.status !== "valid" || !exported.resume) {
    throw new AppError("Resume is not available for this share", 409);
  }
  const pdf = await renderAtsResumePdf(exported.resume, shareId);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="sijil-resume.pdf"');
  res.setHeader("Cache-Control", "no-store");
  res.send(Buffer.from(pdf));
}

export async function getOwnerWalletResume(req: Request, res: Response): Promise<Response> {
  const exported = await runWithUserDb(req.accessToken, () =>
    walletService.getOwnerWalletResume(req.user!.id),
  );
  return sendSuccess(res, exported);
}

export async function downloadOwnerWalletResumePdf(req: Request, res: Response): Promise<void> {
  const exported = await runWithUserDb(req.accessToken, () =>
    walletService.getOwnerWalletResume(req.user!.id),
  );
  if (!exported.resume) {
    throw new AppError("Resume is not available", 409);
  }
  const pdf = await renderAtsResumePdf(exported.resume, "wallet");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="sijil-wallet-resume.pdf"');
  res.setHeader("Cache-Control", "no-store");
  res.send(Buffer.from(pdf));
}

export async function getOwnerShareResume(req: Request, res: Response): Promise<Response> {
  const { shareId } = shareIdParamSchema.parse(req.params);
  const exported = await runWithUserDb(req.accessToken, () =>
    walletService.getOwnerShareExport(req.user!.id, shareId),
  );
  return sendSuccess(res, exported);
}

export async function downloadAppleWalletPass(req: Request, res: Response): Promise<void> {
  const { token } = presentationTokenParamSchema.parse(req.params);
  const credential = await walletService.getPublicCredential(token);
  if (credential.status === "revoked") {
    throw new AppError("This credential share has been revoked", 410);
  }
  if (credential.status !== "valid" || !credential.resume) {
    throw new AppError("Wallet pass is not available for this share", 409);
  }
  const pkpass = await buildApplePkpass({
    shareToken: token,
    resume: credential.resume,
    status: credential.status,
    verified: credential.verified,
  });
  res.setHeader("Content-Type", "application/vnd.apple.pkpass");
  res.setHeader("Content-Disposition", 'attachment; filename="sijil-credential.pkpass"');
  res.setHeader("Cache-Control", "no-store");
  res.send(pkpass);
}

export async function getGoogleWalletPass(req: Request, res: Response): Promise<Response> {
  const { token } = presentationTokenParamSchema.parse(req.params);
  const credential = await walletService.getPublicCredential(token);
  if (credential.status === "revoked") {
    throw new AppError("This credential share has been revoked", 410);
  }
  if (credential.status !== "valid" || !credential.resume) {
    throw new AppError("Wallet pass is not available for this share", 409);
  }
  const result = buildGoogleWalletLink({
    shareToken: token,
    resume: credential.resume,
    status: credential.status,
    verified: credential.verified,
  });
  return sendSuccess(res, result);
}
