/**
 * In-memory public-verify cache keyed by credentialId + credential_hash.
 * TTL is 5 minutes; callers must invalidate on revoke.
 */
import type { CredentialVerifyResult } from "./credential-verify";

export const VERIFY_CACHE_TTL_MS = 5 * 60 * 1000;

export type CacheClock = () => number;

export interface VerifyCache<T> {
  get(credentialId: string, hash: string | null | undefined): T | undefined;
  set(credentialId: string, hash: string | null | undefined, value: T): void;
  invalidateCredential(credentialId: string): void;
  clear(): void;
  size(): number;
}

export function verifyCacheKey(credentialId: string, hash: string | null | undefined): string {
  return `${credentialId}:${hash ?? ""}`;
}

const TERMINAL_VERIFY_STATUSES = ["verified", "tampered", "revoked", "not_found"] as const;

export function shouldCacheVerifyResult(status: string): boolean {
  return (TERMINAL_VERIFY_STATUSES as readonly string[]).includes(status);
}

export function makeVerifyCache<T>(
  ttlMs = VERIFY_CACHE_TTL_MS,
  now: CacheClock = () => Date.now(),
): VerifyCache<T> {
  const entries = new Map<string, { value: T; expiresAt: number }>();

  return {
    get(credentialId, hash) {
      const key = verifyCacheKey(credentialId, hash);
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (hit.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(credentialId, hash, value) {
      entries.set(verifyCacheKey(credentialId, hash), {
        value,
        expiresAt: now() + ttlMs,
      });
    },
    invalidateCredential(credentialId) {
      const prefix = `${credentialId}:`;
      for (const key of [...entries.keys()]) {
        if (key.startsWith(prefix)) entries.delete(key);
      }
    },
    clear() {
      entries.clear();
    },
    size() {
      return entries.size;
    },
  };
}

export const publicVerifyCache = makeVerifyCache<CredentialVerifyResult>();
