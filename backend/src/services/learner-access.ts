/**
 * Owner-or-active-share authorization for learner credential and candidate reads.
 */
import type { Request } from "express";
import { AppRole, ROLES } from "../constants/roles";

export interface AuthCaller {
  id: string;
  roles: AppRole[];
}

export function callerFromRequest(req: Request): AuthCaller {
  return {
    id: req.user!.id,
    roles: req.userRoles ?? [],
  };
}

export function isActiveShareRow(params: {
  revoked?: boolean | null;
  revokedAt?: string | null;
  expiresAt?: string | null;
  now?: Date;
}): boolean {
  if (params.revoked || params.revokedAt) return false;
  if (!params.expiresAt) return true;
  const expires = new Date(params.expiresAt).getTime();
  if (Number.isNaN(expires)) return true;
  return expires > (params.now ?? new Date()).getTime();
}

export function canReadLearnerData(params: {
  caller: AuthCaller;
  ownerId: string;
  hasActiveShare: boolean;
}): boolean {
  if (params.caller.id === params.ownerId) return true;
  if (params.caller.roles.includes(ROLES.ADMIN)) return true;
  return params.caller.roles.includes(ROLES.RECRUITER) && params.hasActiveShare;
}
