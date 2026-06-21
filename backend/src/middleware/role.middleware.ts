/**
 * Role-based access control middleware for learner, institution, and recruiter routes.
 */
import { Request, Response, NextFunction } from "express";
import { AppRole } from "../constants/roles";
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

export const requireLearner = requireRole("learner", "admin");
export const requireInstitution = requireRole("institution", "admin");
export const requireRecruiter = requireRole("recruiter", "admin");
