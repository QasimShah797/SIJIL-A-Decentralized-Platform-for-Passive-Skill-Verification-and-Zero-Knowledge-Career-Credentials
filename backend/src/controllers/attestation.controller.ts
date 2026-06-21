/**
 * Attestation queue and decision HTTP handlers — delegate to attestationService.
 */
import { Request, Response } from "express";
import { attestationService } from "../services/attestation.service";
import { sendSuccess } from "../utils/apiResponse";
import { attestationDecisionSchema } from "../validators/attestation.validator";
import { AppError } from "../utils/AppError";

export async function getAttestationQueue(req: Request, res: Response): Promise<Response> {
  const queue = await attestationService.getQueue();
  return sendSuccess(res, queue);
}

export async function approveAttestation(req: Request, res: Response): Promise<Response> {
  const { id, remarks } = attestationDecisionSchema.parse(req.body);
  const record = await attestationService.approve(id, remarks);
  return sendSuccess(res, record, "Attestation approved");
}

export async function rejectAttestation(req: Request, res: Response): Promise<Response> {
  const { id, remarks } = attestationDecisionSchema.parse(req.body);
  if (!remarks?.trim()) throw new AppError("Remarks required for rejection", 400);
  const record = await attestationService.reject(id, remarks);
  return sendSuccess(res, record, "Attestation rejected");
}

export async function clarificationAttestation(req: Request, res: Response): Promise<Response> {
  const { id, remarks } = attestationDecisionSchema.parse(req.body);
  if (!remarks?.trim()) throw new AppError("Remarks required for clarification request", 400);
  const record = await attestationService.requestClarification(id, remarks);
  return sendSuccess(res, record, "Clarification requested");
}
