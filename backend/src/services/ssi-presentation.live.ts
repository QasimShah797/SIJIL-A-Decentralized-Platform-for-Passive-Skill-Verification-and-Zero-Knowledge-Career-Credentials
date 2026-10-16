import { AppError } from "../utils/AppError";
import type { CredentialDocument } from "./credential-document.service";
import { loadCredentialByIdOrUri, verifyPublicCredential } from "./credential-verify.service";
import { ssiService } from "./ssi.service";
import { DurableSsiPresentationChallengeStore } from "./ssi-presentation-durable.store";
import {
  SsiPresentationService,
  type PresentationCredentialSource,
} from "./ssi-presentation.service";
import type { IssuerCredentialProof } from "./ssi-presentation-protocol";

function asIssuerProof(proof: Record<string, unknown> | null): IssuerCredentialProof {
  if (!proof) throw new AppError("Credential is missing an issuer proof", 409);
  return {
    type: String(proof.type ?? ""),
    cryptosuite: String(proof.cryptosuite ?? ""),
    created: String(proof.created ?? ""),
    verificationMethod: String(proof.verificationMethod ?? ""),
    proofValue: String(proof.proofValue ?? ""),
    proofPurpose: String(proof.proofPurpose ?? ""),
  };
}

export async function loadPresentationCredentials(ids: string[]): Promise<PresentationCredentialSource[]> {
  const rows: PresentationCredentialSource[] = [];
  for (const id of ids) {
    const row = await loadCredentialByIdOrUri(id);
    if (!row) continue;
    if (!row.credential_document || typeof row.credential_document !== "object") {
      throw new AppError("Credential document is missing", 409);
    }
    rows.push({
      id: row.id,
      userId: row.user_id,
      holderDid: row.holder_did,
      document: row.credential_document as unknown as CredentialDocument,
      proof: asIssuerProof(row.proof),
      hash: row.credential_hash ?? "",
      revokedAt: row.revoked_at ?? null,
    });
  }
  return rows;
}

export const ssiPresentationService = new SsiPresentationService({
  loadCredentials: loadPresentationCredentials,
  requireHolderDid: (userId) => ssiService.requireProvenHolderDid(userId),
  verifyIssued: (credentialId) => verifyPublicCredential(credentialId),
}, new DurableSsiPresentationChallengeStore());
