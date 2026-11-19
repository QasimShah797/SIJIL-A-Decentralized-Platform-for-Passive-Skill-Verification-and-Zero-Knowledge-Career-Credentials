/**
 * Credential revocation is limited to the learner who holds it and to an admin.
 * Reviewers and recruiters cannot revoke an unrelated credential.
 */
import { ROLES } from "../constants/roles";

export function canRevokeIssuedCredential(
  caller: { id: string; roles: readonly string[] },
  ownerId: string,
): boolean {
  if (caller.roles.includes(ROLES.ADMIN)) return true;
  return caller.id === ownerId && caller.roles.includes(ROLES.LEARNER);
}
