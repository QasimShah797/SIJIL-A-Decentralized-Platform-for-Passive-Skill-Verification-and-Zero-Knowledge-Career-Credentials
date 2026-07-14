import type { LucideIcon } from "lucide-react";
import { Link2, MoreHorizontal, RefreshCw, Unplug } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { cn } from "@/lib/utils";

export type ConnectionStatus = "connected" | "available" | "disconnected";

const statusVariant: Record<ConnectionStatus, "verified" | "info" | "neutral"> = {
  connected: "verified",
  available: "info",
  disconnected: "neutral",
};

const statusLabel: Record<ConnectionStatus, string> = {
  connected: "Connected",
  available: "Available",
  disconnected: "Not connected",
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

  return (
    <Card className={cn("h-full", className)}>
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
            <Icon className="h-4 w-4 text-foreground" aria-hidden />
          </div>
          <StatusBadge variant={statusVariant[status]}>{statusLabel[status]}</StatusBadge>
        </div>

        <div className="mt-3 flex-1 space-y-1">
          <h3 className="text-base font-semibold text-foreground">{name}</h3>
          {account && (
            <p className="text-sm text-muted-foreground truncate" title={account}>
              {account}
            </p>
          )}
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate" title={subtitle}>
              {subtitle}
            </p>
          )}
          {lastSync !== undefined && (
            <p className="text-xs text-muted-foreground">
              Last sync: {lastSync ?? "—"}
            </p>
          )}
          {records !== undefined && (
            <p className="text-xs text-muted-foreground">
              {records} {recordsLabel}
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2">
          {showPrimary && (
            <Button
              size="sm"
              className="flex-1 min-h-9"
              variant={isConnected ? "outline" : "default"}
              onClick={onPrimary}
              disabled={primaryDisabled || primaryLoading || connectLoading}
            >
              {(primaryLoading || syncLoading || connectLoading) && (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              )}
              {primaryLoading || syncLoading
                ? "Syncing…"
                : connectLoading
                  ? "Connecting…"
                  : primaryLabel}
            </Button>
          )}

          {isConnected && (onSync || onConnect || onDisconnect) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 shrink-0 px-0"
                    aria-label={`${name} actions`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {onSync && (
                    <DropdownMenuItem onClick={onSync} disabled={syncLoading}>
                      <RefreshCw className="mr-2 h-3.5 w-3.5" />
                      Sync now
                    </DropdownMenuItem>
                  )}
                  {onConnect && (
                    <DropdownMenuItem onClick={onConnect} disabled={connectLoading}>
                      <Link2 className="mr-2 h-3.5 w-3.5" />
                      Reconnect
                    </DropdownMenuItem>
                  )}
                  {onDisconnect && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={onDisconnect}
                        className="text-destructive focus:text-destructive"
                      >
                        <Unplug className="mr-2 h-3.5 w-3.5" />
                        Disconnect
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
          )}

          {!isConnected && onConnect && !showPrimary && (
            <Button size="sm" className="flex-1 min-h-9" onClick={onConnect} disabled={connectLoading}>
              {connectLoading ? "Connecting…" : connectLabel}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
