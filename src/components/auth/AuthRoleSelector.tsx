import { Briefcase, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuthRole } from "@/pages/auth/AuthEntry";

const ROLES = [
  {
    id: "learner" as const,
    label: "Learner",
    hint: "Build and share verified skills",
    icon: GraduationCap,
  },
  {
    id: "recruiter" as const,
    label: "Recruiter",
    hint: "Verify candidate credentials",
    icon: Briefcase,
  },
] as const;

type AuthRoleSelectorProps = {
  role: AuthRole | null;
  onSelect: (role: AuthRole) => void;
};

export function AuthRoleSelector({ role, onSelect }: AuthRoleSelectorProps) {
  return (
    <div className="auth-role-grid" role="radiogroup" aria-label="Select workspace">
      {ROLES.map(({ id, label, hint, icon: Icon }) => {
        const selected = role === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(id)}
            className={cn(
              "auth-role-card",
              selected ? "auth-role-card--selected" : "auth-role-card--idle",
            )}
          >
            <span
              className={cn(
                "auth-role-icon",
                selected ? "auth-role-icon--selected" : "auth-role-icon--idle",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="auth-role-label">{label}</span>
              <span className="auth-role-hint block">{hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
