/**
 * JWT authentication middleware — verifies Supabase access tokens from Authorization header.
 */
import { Request, Response, NextFunction } from "express";
import { getAnonSupabase, getServiceSupabase, getUserSupabase } from "../config/supabase";
import { AppError } from "../utils/AppError";
import { AppRole } from "../constants/roles";

function isUnreachableAuth(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as { message?: string; name?: string; status?: number; cause?: { code?: string; message?: string } };
  const text = `${row.name ?? ""} ${row.message ?? ""} ${row.cause?.code ?? ""} ${row.cause?.message ?? ""}`.toLowerCase();
  return (
    text.includes("fetch failed")
    || text.includes("timeout")
    || text.includes("und_err_connect_timeout")
    || text.includes("econnrefused")
    || text.includes("enotfound")
    || text.includes("network")
    || row.status === 0
  );
}

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new AppError("Missing or invalid Authorization header", 401);
    }

    const token = header.slice(7);
    const anon = getAnonSupabase();
    const { data, error } = await anon.auth.getUser(token);

    if (error || !data.user) {
      if (isUnreachableAuth(error)) {
        throw new AppError(
          "Could not reach the sign-in service. Check your internet connection and try again.",
          503,
        );
      }
      throw new AppError("Invalid or expired token", 401);
    }

    const service = getServiceSupabase();
    let { data: roleRows } = await service
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);

    if (!roleRows?.length) {
      const scoped = getUserSupabase(token);
      const scopedRoles = await scoped
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      roleRows = scopedRoles.data;
    }

    const roles = (roleRows ?? []).map((r) => r.role as AppRole);

    req.user = { ...data.user, roles };
    req.userRoles = roles;
    req.accessToken = token;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    if (isUnreachableAuth(err)) {
      next(new AppError(
        "Could not reach the sign-in service. Check your internet connection and try again.",
        503,
      ));
      return;
    }
    next(err);
  }
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
