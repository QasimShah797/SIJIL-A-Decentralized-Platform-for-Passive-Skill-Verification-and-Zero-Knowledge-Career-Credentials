import { useCallback, useEffect, useState } from "react";
import { Github, Loader2, ShieldCheck, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { toast } from "@/hooks/use-toast";
import { formatSupabaseError } from "@/lib/utils";
import {
  disconnectGitHub,
  fetchGitHubConnection,
  startGitHubOAuth,
  type GitHubConnection,
} from "@/lib/github-integration";

type VerifiedGitHubCardProps = {
  userId: string;
  returnTo?: string;
  onBeforeConnect?: () => void;
  onConnectionChange?: (connected: boolean) => void;
  required?: boolean;
};

export function VerifiedGitHubCard({
  userId,
  returnTo,
  onBeforeConnect,
  onConnectionChange,
  required = true,
}: VerifiedGitHubCardProps) {
  const [connection, setConnection] = useState<GitHubConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const conn = await fetchGitHubConnection(userId);
      setConnection(conn);
      onConnectionChange?.(!!conn);
    } catch (err) {
      toast({
        title: "Could not load GitHub connection",
        description: formatSupabaseError(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [userId, onConnectionChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connect = async () => {
    setBusy(true);
    try {
      onBeforeConnect?.();
      const path = returnTo ?? window.location.pathname;
      const prepareUrl = await startGitHubOAuth({ returnTo: path, skipPortfolioSync: true });
      window.location.assign(prepareUrl);
    } catch (err) {
      toast({
        title: "GitHub connection failed",
        description: formatSupabaseError(err),
        variant: "destructive",
      });
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await disconnectGitHub(userId);
      setConnection(null);
      onConnectionChange?.(false);
      toast({ title: "GitHub disconnected" });
    } catch (err) {
      toast({
        title: "Could not disconnect GitHub",
        description: formatSupabaseError(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const verified = !!connection;
  const profileUrl = connection ? `https://github.com/${connection.github_username}` : null;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Github className="h-5 w-5" />
          <div>
            <div className="text-sm font-medium">GitHub</div>
            <div className="text-xs text-muted-foreground">
              {required ? "Required — connect and verify" : "Connect and verify"}
            </div>
          </div>
        </div>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : verified ? (
          <StatusBadge variant="verified" icon={<ShieldCheck className="h-3 w-3" />}>
            Verified
          </StatusBadge>
        ) : (
          <StatusBadge variant="outline">Not connected</StatusBadge>
        )}
      </div>

      {verified && connection ? (
        <div className="flex items-center gap-3">
          {connection.github_avatar_url ? (
            <img
              src={connection.github_avatar_url}
              alt=""
              className="h-10 w-10 rounded-full border object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">@{connection.github_username}</div>
            {profileUrl ? (
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline truncate block"
              >
                {profileUrl}
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Connect your GitHub account through OAuth. Your profile URL is set automatically — you cannot
          type or edit it manually.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {verified ? (
          <>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void connect()}>
              Reconnect
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void disconnect()}
              className="text-destructive hover:text-destructive"
            >
              <Unlink className="h-3.5 w-3.5 mr-1" />
              Disconnect
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" disabled={busy || loading} onClick={() => void connect()}>
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                Redirecting…
              </>
            ) : (
              "Connect GitHub"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
