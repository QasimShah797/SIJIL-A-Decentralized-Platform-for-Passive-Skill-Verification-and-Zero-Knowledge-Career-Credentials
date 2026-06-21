/**
 * Authentication-related TypeScript types for request context.
 */
import { User } from "@supabase/supabase-js";
import { AppRole } from "../constants/roles";

export interface AuthUser extends User {
  roles?: AppRole[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      userRoles?: AppRole[];
    }
  }
}

export {};
