/**
 * Attestation API — backend layer for institution approve/reject/clarification.
 */
import { tryApiRequest } from "./client";
import type { AttestationRecord } from "@/lib/sijil-data";

export async function approveAttestationApi(
  id: string,
  remarks?: string,
): Promise<AttestationRecord | null> {
  return tryApiRequest<AttestationRecord>("/attestation/approve", {
    method: "POST",
    body: JSON.stringify({ id, remarks }),
  });
}

export async function rejectAttestationApi(
  id: string,
  remarks: string,
): Promise<AttestationRecord | null> {
  return tryApiRequest<AttestationRecord>("/attestation/reject", {
    method: "POST",
    body: JSON.stringify({ id, remarks }),
  });
}

export async function clarificationAttestationApi(
  id: string,
  remarks: string,
): Promise<AttestationRecord | null> {
  return tryApiRequest<AttestationRecord>("/attestation/clarification", {
    method: "POST",
    body: JSON.stringify({ id, remarks }),
  });
}

export async function getAttestationQueueApi(): Promise<AttestationRecord[] | null> {
  return tryApiRequest<AttestationRecord[]>("/attestation/queue");
}
