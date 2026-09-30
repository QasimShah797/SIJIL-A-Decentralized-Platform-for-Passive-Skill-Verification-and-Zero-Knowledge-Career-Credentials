/**
 * Role-based access control middleware for learner, reviewer, recruiter, and admin routes.
 * `institution` remains a legacy alias of reviewer.
 */
import { Request, Response, NextFunction } from "express";
import { AppRole, ROLES } from "../constants/roles";
import { AppError } from "../utils/AppError";

export function requireRole(...allowed: AppRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError("Authentication required", 401);
    }

    const userRoles = req.userRoles ?? [];
    const hasRole = allowed.some((role) => userRoles.includes(role));

    if (!hasRole) {
      throw new AppError("Insufficient permissions", 403);
    }

    next();
  };
}

export const REVIEWER_ROLES: AppRole[] = [ROLES.REVIEWER, ROLES.INSTITUTION, ROLES.ADMIN];

export const requireLearner = requireRole(ROLES.LEARNER, ROLES.ADMIN);
export const requireReviewer = requireRole(...REVIEWER_ROLES);
/** @deprecated Institution UI is retired; use requireReviewer. Kept as a legacy alias. */
export const requireInstitution = requireReviewer;
export const requireRecruiter = requireRole(ROLES.RECRUITER, ROLES.ADMIN);
export const requireAdmin = requireRole(ROLES.ADMIN);
