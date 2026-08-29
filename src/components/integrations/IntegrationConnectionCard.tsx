import type { LucideIcon } from "lucide-react";
import { Link2, MoreHorizontal, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ConnectionStatus = "connected" | "available" | "disconnected";

const statusStyles: Record<ConnectionStatus, string> = {
  connected: "bg-[#ecfdf5] text-[#059669] border-[#bbf7d0]",
  available: "bg-[#e8eef7] text-[#023E8A] border-[#c5d4eb]",
  disconnected: "bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]",
};

const statusLabel: Record<ConnectionStatus, string> = {
  connected: "Connected",
  available: "Available",
  disconnected: "Not connected",
};

const iconStyles: Record<string, string> = {
  "Moodle LMS": "bg-[#fff7ed] text-[#ea580c]",
  GitHub: "bg-[#0f172a] text-white",
  "External Certificate Upload": "bg-[#e8eef7] text-[#023E8A]",
};

export type IntegrationConnectionCardProps = {
  icon: LucideIcon;
  name: string;
  status: ConnectionStatus;
  account?: string;
  subtitle?: string;
  lastSync?: string | null;
  records?: number;
  recordsLabel?: string;
  primaryLabel: string;
  onPrimary: () => void;
  primaryLoading?: boolean;
  primaryDisabled?: boolean;
  showPrimary?: boolean;
  onConnect?: () => void;
  onSync?: () => void;
  onDisconnect?: () => void;
  connectLoading?: boolean;
  syncLoading?: boolean;
  connectLabel?: string;
  className?: string;
};

export function IntegrationConnectionCard({
  icon: Icon,
  name,
  status,
  account,
  subtitle,
  lastSync,
  records,
  recordsLabel = "records imported",
  primaryLabel,
  onPrimary,
  primaryLoading = false,
  primaryDisabled = false,
  showPrimary = true,
  onConnect,
  onSync,
  onDisconnect,
  connectLoading = false,
  syncLoading = false,
  connectLabel = "Connect",
  className,
}: IntegrationConnectionCardProps) {
  const isConnected = status === "connected";
  const isAvailable = status === "available";

  return (
    <div className={cn("learner-stat-card flex h-full flex-col p-5", className)}>
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            iconStyles[name] ?? "bg-[#e8eef7] text-[#023E8A]",
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            statusStyles[status],
          )}
        >
          {statusLabel[status]}
        </span>
      </div>

      <div className="mt-4 flex-1 space-y-2">
        <h3 className="text-base font-semibold text-[#023E8A]">{name}</h3>
        {isAvailable && subtitle ? (
          <p className="text-xs leading-relaxed text-[#64748b]">{subtitle}</p>
        ) : null}
        {account ? (
          <div className="text-xs">
            <span className="text-[#64748b]">{name.includes("Moodle") ? "Email" : "Account"}: </span>
            <span className="font-medium text-[#334155]">{account}</span>
          </div>
        ) : null}
        {subtitle && !isAvailable ? (
          <div className="text-xs">
            <span className="text-[#64748b]">{name.includes("GitHub") ? "Scope" : "Host"}: </span>
            <span className="font-medium text-[#334155]">{subtitle}</span>
          </div>
        ) : null}
        {lastSync !== undefined && isConnected ? (
          <div className="text-xs">
            <span className="text-[#64748b]">Last sync: </span>
            <span className="font-medium text-[#334155]">{lastSync ?? "—"}</span>
          </div>
        ) : null}
        {records !== undefined && isConnected ? (
          <div className="text-xs">
            <span className="font-medium text-[#334155]">
              {records} {recordsLabel}
            </span>
          </div>
        ) : null}
        {isAvailable ? (
          <div className="space-y-1 pt-1 text-[11px] text-[#64748b]">
            <p>
              <span className="font-medium text-[#334155]">Formats:</span> PDF, PNG, JPG
            </p>
            <p>
              <span className="font-medium text-[#334155]">Verification:</span> Manual review
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex items-center gap-2">
        {showPrimary && (
          <Button
            size="sm"
            className={cn(
              "min-h-9 flex-1 rounded-xl",
              isAvailable ? "bg-[#023E8A] hover:bg-[#012A5C]" : "border-[#e2e8f0]",
            )}
            variant={isConnected ? "outline" : "default"}
            onClick={onPrimary}
            disabled={primaryDisabled || primaryLoading || connectLoading}
          >
            {(primaryLoading || syncLoading || connectLoading) && (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            )}
            {primaryLoading || syncLoading ? "Syncing…" : connectLoading ? "Connecting…" : primaryLabel}
          </Button>
        )}

        {isConnected && (onSync || onConnect || onDisconnect) ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-9 w-9 shrink-0 rounded-xl px-0" aria-label={`${name} actions`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {onSync ? (
                <DropdownMenuItem onClick={onSync} disabled={syncLoading}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Sync now
                </DropdownMenuItem>
              ) : null}
              {onConnect ? (
                <DropdownMenuItem onClick={onConnect} disabled={connectLoading}>
                  <Link2 className="mr-2 h-3.5 w-3.5" />
                  Reconnect
                </DropdownMenuItem>
              ) : null}
              {onDisconnect ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDisconnect} className="text-destructive focus:text-destructive">
                    <Unplug className="mr-2 h-3.5 w-3.5" />
                    Disconnect
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {!isConnected && onConnect && !showPrimary ? (
          <Button size="sm" className="min-h-9 flex-1 rounded-xl" onClick={onConnect} disabled={connectLoading}>
            {connectLoading ? "Connecting…" : connectLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
