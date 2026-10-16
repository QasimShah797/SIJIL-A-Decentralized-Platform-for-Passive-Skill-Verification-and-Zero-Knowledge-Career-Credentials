/**
 * Proven learner DID used as credentialSubject.id / holder_did on NEW issuance.
 * Historical credentials keep whatever DID they were signed with.
 */
import { AppError } from "../utils/AppError";
import {
  canonicalSsiBindingFromDid,
  isDidKeyEd25519,
  isLegacyPlaceholderDid,
} from "../utils/did-key";
export const SSI_MIGRATION_HINT =
  "Apply supabase/migrations/20261016120000_learner_ssi_identities.sql before activating SSI identity on a shared project.";

export const SSI_IDENTITY_REQUIRED_MESSAGE =
  "Activate a learner SSI identity before issuing a credential. New credentials must be bound to a proven did:key.";

export const SSI_IDENTITY_INVALID_MESSAGE =
  "Stored SSI identity is not a valid Ed25519 did:key";

export const SSI_IDENTITY_OWNER_MISMATCH_MESSAGE =
  "SSI identity does not belong to the authenticated learner";

export type SsiIdentityLookupRow = {
  user_id?: unknown;
  did?: unknown;
};

export function provenHolderDidFromIdentityRow(input: {
  requestUserId: string;
  row: SsiIdentityLookupRow | null;
  tableReady: boolean;
}): string {
  if (!input.tableReady) {
    throw new AppError(SSI_MIGRATION_HINT, 503);
  }
  if (!input.row) {
    throw new AppError(SSI_IDENTITY_REQUIRED_MESSAGE, 409);
  }

  const ownerId = typeof input.row.user_id === "string" ? input.row.user_id : null;
  if (!ownerId || ownerId !== input.requestUserId) {
    throw new AppError(SSI_IDENTITY_OWNER_MISMATCH_MESSAGE, 403);
  }

  const rawDid = typeof input.row.did === "string" ? input.row.did.trim() : "";
  if (!rawDid || isLegacyPlaceholderDid(rawDid) || !isDidKeyEd25519(rawDid)) {
    throw new AppError(SSI_IDENTITY_INVALID_MESSAGE, 409);
  }

  try {
    return canonicalSsiBindingFromDid(rawDid).did;
  } catch {
    throw new AppError(SSI_IDENTITY_INVALID_MESSAGE, 409);
  }
}
