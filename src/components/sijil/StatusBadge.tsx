import { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusVariant =
  | "verified"
  | "pending"
  | "warning"
  | "info"
  | "neutral"
  | "destructive"
  | "outline";

const styles: Record<StatusVariant, string> = {
  verified: "bg-success-soft text-success border-success/20",
  pending: "bg-info-soft text-info border-info/20",
  warning: "bg-warning-soft text-warning-foreground border-warning/30",
  info: "bg-info-soft text-info border-info/20",
  neutral: "bg-secondary text-secondary-foreground border-border",
  destructive: "bg-destructive/10 text-destructive border-destructive/20",
  outline: "bg-transparent text-foreground border-border",
};

const defaultIcons: Partial<Record<StatusVariant, ReactNode>> = {
  verified: <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden />,
  pending: <Clock className="h-3 w-3 shrink-0" aria-hidden />,
  warning: <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />,
  info: <RefreshCw className="h-3 w-3 shrink-0" aria-hidden />,
  neutral: <CircleDashed className="h-3 w-3 shrink-0" aria-hidden />,
  destructive: <XCircle className="h-3 w-3 shrink-0" aria-hidden />,
};

/** Maps pipeline / attestation strings to unified badge variants */
export function statusToVariant(status: string): StatusVariant {
  const s = status.toLowerCase();
  if (s.includes("verified") || s.includes("approved") || s.includes("valid") || s.includes("passed") || s.includes("complete")) {
    return "verified";
  }
  if (s.includes("pending") || s.includes("review") || s.includes("sync") || s.includes("progress")) {
    return "pending";
  }
  if (s.includes("decay") || s.includes("attention") || s.includes("unsaved")) {
    return "warning";
  }
  if (s.includes("reject") || s.includes("revok") || s.includes("expired") || s.includes("fail")) {
    return "destructive";
  }
  if (s.includes("draft") || s.includes("disconnect") || s.includes("not")) {
    return "neutral";
  }
  return "info";
}

export function StatusBadge({
  children,
  variant = "neutral",
  className,
  icon,
  showDefaultIcon = true,
}: {
  children: ReactNode;
  variant?: StatusVariant;
  className?: string;
  icon?: ReactNode;
  showDefaultIcon?: boolean;
}) {
  const displayIcon = icon ?? (showDefaultIcon ? defaultIcons[variant] : null);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        styles[variant],
        className,
      )}
    >
      {displayIcon}
      {children}
    </span>
  );
}
