/**
 * Owner/admin read of Fabric history. Returns no entries when the ledger cannot be read.
 */
import { AppError } from "../utils/AppError";
import { ROLES } from "../constants/roles";
import { getEvaluateLedgerService } from "./ledger.factory";
import { loadCredentialByIdOrUri } from "./credential-verify.service";
import type { LedgerHistoryEntry } from "./ledger.types";

export interface PublicHistoryEntry {
  txId: string;
  timestamp: string;
  isDelete: boolean;
  status: string | null;
  hash: string | null;
}

export interface CredentialHistoryView {
  available: boolean;
  credentialId: string;
  entries: PublicHistoryEntry[];
}

export async function readCredentialLedgerHistory(
  idOrUri: string,
  caller: { id: string; roles: readonly string[] },
): Promise<CredentialHistoryView> {
  const row = await loadCredentialByIdOrUri(idOrUri);
  if (!row) throw new AppError("Credential not found", 404);
  const allowed = caller.id === row.user_id || caller.roles.includes(ROLES.ADMIN);
  if (!allowed) throw new AppError("Insufficient permissions", 403);

  const ledger = getEvaluateLedgerService();
  if (!ledger.isEnabled()) {
    return { available: false, credentialId: row.id, entries: [] };
  }
  try {
    const history = await ledger.getHistory(row.id);
    return {
      available: true,
      credentialId: row.id,
      entries: history.map(toPublicEntry),
    };
  } catch {
    return { available: false, credentialId: row.id, entries: [] };
  }
}

function toPublicEntry(entry: LedgerHistoryEntry): PublicHistoryEntry {
  return {
    txId: entry.txId,
    timestamp: entry.timestamp,
    isDelete: entry.isDelete,
    status: entry.record?.status ?? null,
    hash: entry.record?.hash ?? null,
  };
}
