import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  Code2,
  ExternalLink,
  MoreHorizontal,
  Plug,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function IntegrationsHero() {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--sijil-blue)/0.08)] text-sijil-blue">
        <Plug className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-[#0f172a] sm:text-[1.65rem]">Integrations</h1>
        <p className="mt-1 max-w-2xl text-sm text-[#64748b]">
          Linked learning platforms and development tools for evidence and competency development.
        </p>
      </div>
    </div>
  );
}

export function LinkedPlatformsHeader() {
  return <h2 className="mb-4 text-base font-semibold text-[#0f172a]">Linked Platforms</h2>;
}

export type LinkedPlatformCardProps = {
  name: string;
  description: string;
  icon: LucideIcon;
  iconClassName?: string;
  active: boolean;
  metaIcon: LucideIcon;
  metaLabel: string;
  lastSync: string | null;
  primaryLabel: string;
  onPrimary: () => void;
  onConnect?: () => void;
  onSync?: () => void;
  onDisconnect?: () => void;
  syncing?: boolean;
  connecting?: boolean;
};

export function LinkedPlatformCard({
  name,
  description,
  icon: Icon,
  iconClassName,
  active,
  metaIcon: MetaIcon,
  metaLabel,
  lastSync,
  primaryLabel,
  onPrimary,
  onConnect,
  onSync,
  onDisconnect,
  syncing = false,
  connecting = false,
}: LinkedPlatformCardProps) {
  return (
    <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
              iconClassName ?? "bg-[hsl(var(--sijil-blue)/0.08)] text-sijil-blue",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[#0f172a]">{name}</h3>
            <p className="mt-0.5 text-sm text-[#64748b]">{description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {active ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#ecfdf5] px-2.5 py-1 text-xs font-semibold text-[#059669]">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Active
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-[#f1f5f9] px-2.5 py-1 text-xs font-semibold text-[#64748b]">
              Not connected
            </span>
          )}
          {(onConnect || onSync || onDisconnect) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748b] hover:bg-[#f8fafc]"
                  aria-label={`${name} options`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {!active && onConnect ? (
                  <DropdownMenuItem onClick={onConnect} disabled={connecting}>
                    Connect
                  </DropdownMenuItem>
                ) : null}
                {active && onSync ? (
                  <DropdownMenuItem onClick={onSync} disabled={syncing}>
                    <RefreshCw className={cn("mr-2 h-3.5 w-3.5", syncing && "animate-spin")} />
                    {syncing ? "Syncing…" : "Sync now"}
                  </DropdownMenuItem>
                ) : null}
                {active && onDisconnect ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={onDisconnect}
                    >
                      <Unplug className="mr-2 h-3.5 w-3.5" />
                      Disconnect
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-2 text-sm text-[#64748b]">
        <div className="flex items-center gap-2">
          <MetaIcon className="h-4 w-4 shrink-0 text-[#94a3b8]" aria-hidden />
          <span>{metaLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 shrink-0 text-[#94a3b8]" aria-hidden />
          <span>{lastSync ? `Last sync: ${lastSync}` : "Not synced yet"}</span>
        </div>
      </div>

      <Button
        type="button"
        variant="secondary"
        className="mt-5 h-10 rounded-xl bg-[hsl(var(--sijil-blue)/0.08)] text-sijil-blue hover:bg-[hsl(var(--sijil-blue)/0.12)]"
        onClick={onPrimary}
        disabled={connecting || syncing}
      >
        {primaryLabel}
        <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden />
      </Button>
    </div>
  );
}

export function IntegrationsFooter() {
  return null;
}

export function IntegrationsBreadcrumbBar(_props: {
  didShort?: string;
  allSynced?: boolean;
}): ReactNode {
  return null;
}

export function ConnectedSourcesHeader(_props: { onManageAll?: () => void }): ReactNode {
  return null;
}

export { BookOpen, Code2 };
