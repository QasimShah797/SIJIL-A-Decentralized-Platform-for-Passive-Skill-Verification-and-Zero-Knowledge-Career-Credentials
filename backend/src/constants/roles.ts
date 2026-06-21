/**
 * Application role constants matching Supabase user_roles table values.
 */
export const ROLES = {
  LEARNER: "learner",
  INSTITUTION: "institution",
  RECRUITER: "recruiter",
  ADMIN: "admin",
} as const;

export type AppRole = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_HIERARCHY: AppRole[] = ["admin", "institution", "recruiter", "learner"];
