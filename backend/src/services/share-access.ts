/**
 * Recipient access for an existing wallet share link.
 * Expired and revoked links do not return the stored disclosure payload.
 */
export type ShareLinkAccess = "active" | "expired" | "revoked";

export function shareLinkAccess(input: {
  revoked: boolean;
  expiresAt: string | null;
  now?: number;
}): ShareLinkAccess {
  if (input.revoked) return "revoked";
  if (input.expiresAt) {
    const expires = new Date(input.expiresAt).getTime();
    if (!Number.isNaN(expires) && expires <= (input.now ?? Date.now())) return "expired";
  }
  return "active";
}

export function payloadVisibleToRecipient<T extends Record<string, unknown>>(
  access: ShareLinkAccess,
  payload: T,
): T | Record<string, never> {
  return access === "active" ? payload : {};
}
