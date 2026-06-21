/**
 * JWT authentication middleware — verifies Supabase access tokens from Authorization header.
 */
import { Request, Response, NextFunction } from "express";
import { getAnonSupabase, getServiceSupabase } from "../config/supabase";
import { AppError } from "../utils/AppError";
import { AppRole } from "../constants/roles";

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new AppError("Missing or invalid Authorization header", 401);
  }

  const token = header.slice(7);
  const anon = getAnonSupabase();
  const { data, error } = await anon.auth.getUser(token);

  if (error || !data.user) {
    throw new AppError("Invalid or expired token", 401);
  }

  const service = getServiceSupabase();
  const { data: roleRows } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);

  const roles = (roleRows ?? []).map((r) => r.role as AppRole);

  req.user = { ...data.user, roles };
  req.userRoles = roles;
  next();
}

export function optionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }

  authMiddleware(req, _res, next).catch(next);
}
