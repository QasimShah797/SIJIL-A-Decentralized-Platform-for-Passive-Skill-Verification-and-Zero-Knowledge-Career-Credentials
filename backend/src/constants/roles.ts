/**
 * Application role constants matching Supabase user_roles table values.
 */
export const ROLES = {
  LEARNER: "learner",
  REVIEWER: "reviewer",
  INSTITUTION: "institution",
  RECRUITER: "recruiter",
  ADMIN: "admin",
} as const;

export type AppRole = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_HIERARCHY: AppRole[] = ["admin", "reviewer", "institution", "recruiter", "learner"];

export const CLIENT_SELF_GRANT_ROLES = [ROLES.LEARNER, ROLES.RECRUITER] as const;

export const GRANTABLE_OPERATOR_ROLES = [ROLES.REVIEWER, ROLES.ADMIN] as const;

export function canClientGrantRole(role: string): boolean {
  return (CLIENT_SELF_GRANT_ROLES as readonly string[]).includes(role);
}

export function isGrantableOperatorRole(role: string): role is (typeof GRANTABLE_OPERATOR_ROLES)[number] {
  return (GRANTABLE_OPERATOR_ROLES as readonly string[]).includes(role);
}

/** user_roles.user_id is UNIQUE — a user may hold at most one app_role. */
export function isSingleRoleAssignment(roles: readonly string[]): boolean {
  return new Set(roles).size <= 1;
}
