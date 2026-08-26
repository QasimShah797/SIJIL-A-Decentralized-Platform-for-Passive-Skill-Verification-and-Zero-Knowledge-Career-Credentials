import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

const requirements = [
  { id: "length", label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { id: "upper", label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { id: "lower", label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { id: "number", label: "One number", test: (p: string) => /\d/.test(p) },
  { id: "special", label: "One special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export function PasswordRequirements({ password, className }: { password: string; className?: string }) {
  if (!password) return null;

  return (
    <ul className={cn("mt-2 space-y-1", className)} aria-label="Password requirements">
      {requirements.map((req) => {
        const met = req.test(password);
        return (
          <li
            key={req.id}
            className={cn(
              "flex items-center gap-2 text-xs",
              met ? "text-success" : "text-muted-foreground",
            )}
          >
            {met ? (
              <Check className="h-3 w-3 shrink-0" aria-hidden />
            ) : (
              <X className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
            )}
            {req.label}
          </li>
        );
      })}
    </ul>
  );
}

export function PasswordRequirementsSimple({ password }: { password: string }) {
  const met = password.length >= 8;
  return (
    <p className={cn("mt-1 text-xs", met ? "text-success" : "text-muted-foreground")}>
      {met ? "✓" : "○"} At least 8 characters
    </p>
  );
}
