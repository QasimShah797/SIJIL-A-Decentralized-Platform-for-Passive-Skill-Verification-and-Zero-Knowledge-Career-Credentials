export class LedgerDisabledError extends Error {
  readonly code = "LEDGER_DISABLED" as const;

  constructor(message = "Hyperledger Fabric ledger is disabled (FABRIC_ENABLED=false)") {
    super(message);
    this.name = "LedgerDisabledError";
    Object.setPrototypeOf(this, LedgerDisabledError.prototype);
  }
}

/** Non-retryable ledger failure (bad payload or conflicting hash). */
export class LedgerPermanentError extends Error {
  readonly code = "LEDGER_PERMANENT" as const;

  constructor(message: string) {
    super(message);
    this.name = "LedgerPermanentError";
    Object.setPrototypeOf(this, LedgerPermanentError.prototype);
  }
}

export function isDuplicateAnchorError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /already anchored/i.test(message);
}

export function isAlreadyRevokedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /already revoked/i.test(message);
}

/** Strip PEM blocks if a library ever embeds them in Error.message. */
export function publicErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/-----BEGIN[\s\S]*?-----END [A-Z ]+-----/g, "[redacted]").slice(0, 2000);
}
