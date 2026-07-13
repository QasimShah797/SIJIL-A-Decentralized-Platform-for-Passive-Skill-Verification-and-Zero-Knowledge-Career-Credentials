import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Linkedin, Loader2, ShieldCheck, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { toast } from "@/hooks/use-toast";
import { formatSupabaseError } from "@/lib/utils";
import {
  disconnectLinkedIn,
  fetchLinkedInConnection,
  probeLinkedInOAuthConfigured,
  resetLinkedInConfiguredCache,
  startLinkedInOAuth,
  type LinkedInConnection,
} from "@/lib/db/linkedin-connections";

type VerifiedLinkedInCardProps = {
  userId: string;
  returnTo?: string;
  onBeforeConnect?: () => void;
  onConnectionChange?: (connected: boolean) => void;
};

const LINKEDIN_ERROR_MESSAGES: Record<string, string> = {
  user_denied: "You cancelled LinkedIn authorization.",
  state_expired: "The connection session expired. Please try again.",
  state_used: "This connection session was already used. Please try again.",
  state_invalid: "Invalid OAuth state. Please try again.",
  already_linked: "This LinkedIn account is already linked to another SIJIL user.",
  token_exchange_failed: "Could not exchange the authorization code with LinkedIn.",
  token_exchange: "Could not exchange the authorization code with LinkedIn.",
  userinfo_invalid: "Could not fetch a valid LinkedIn profile.",
  userinfo_failed: "Could not fetch your LinkedIn profile.",
  connection_save_failed: "LinkedIn authorized successfully but SIJIL could not save the connection.",
  missing_callback_parameters: "LinkedIn did not return the required authorization data.",
  missing_params: "LinkedIn did not return the required authorization data.",
  server_not_configured: "LinkedIn OAuth is not configured on the server.",
  oauth_failed: "LinkedIn connection failed. Please try again.",
};

export function VerifiedLinkedInCard({
  userId,
  returnTo,
  onBeforeConnect,
  onConnectionChange,
}: VerifiedLinkedInCardProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [configured, setConfigured] = useState(true);
  const [connection, setConnection] = useState<LinkedInConnection | null>(null);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadConnection = useCallback(async () => {
    setConnectionLoading(true);
    try {
      const conn = await fetchLinkedInConnection(userId);
      setConnection(conn);
      onConnectionChange?.(!!conn);
    } catch (err) {
      toast({
        title: "Could not load LinkedIn connection",
        description: formatSupabaseError(err),
        variant: "destructive",
      });
    } finally {
      setConnectionLoading(false);
    }
  }, [userId, onConnectionChange]);

  useEffect(() => {
    resetLinkedInConfiguredCache();
    void probeLinkedInOAuthConfigured().then((available) => {
      setConfigured(available);
    });
    void loadConnection();
  }, [loadConnection, userId]);

  useEffect(() => {
    const linkedinStatus = searchParams.get("linkedin");
    if (!linkedinStatus) return;

    const reason = searchParams.get("reason") ?? searchParams.get("code");
    const next = new URLSearchParams(searchParams);
    next.delete("linkedin");
    next.delete("reason");
    next.delete("code");
    setSearchParams(next, { replace: true });

    if (linkedinStatus === "connected") {
      toast({ title: "LinkedIn connected successfully" });
      void loadConnection();
    } else if (linkedinStatus === "error") {
      const description =
        (reason && LINKEDIN_ERROR_MESSAGES[reason]) ||
        "LinkedIn connection failed. Please try again.";
      toast({ title: "LinkedIn connection failed", description, variant: "destructive" });
    }
  }, [searchParams, setSearchParams, loadConnection]);

  const handleConnectLinkedIn = async () => {
    setConnecting(true);
    try {
      onBeforeConnect?.();
      const path = returnTo ?? "/learner/complete-profile";
      const authorizeUrl = await startLinkedInOAuth({ returnTo: path });
      window.location.assign(authorizeUrl);
    } catch (err) {
      toast({
        title: "LinkedIn connection failed",
        description: formatSupabaseError(err),
        variant: "destructive",
      });
    } finally {
      setConnecting(false);
    }
  };

  const confirmDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectLinkedIn(userId);
      setConnection(null);
      onConnectionChange?.(false);
      setDisconnectOpen(false);
      toast({ title: "LinkedIn disconnected" });
    } catch (err) {
      toast({
        title: "Could not disconnect LinkedIn",
        description: formatSupabaseError(err),
        variant: "destructive",
      });
    } finally {
      setDisconnecting(false);
    }
  };

  if (!configured) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Linkedin className="h-5 w-5" />
          <div className="text-sm font-medium">LinkedIn</div>
        </div>
        <p className="text-xs text-muted-foreground">
          LinkedIn connection is currently unavailable. You can complete your profile without it.
        </p>
      </div>
    );
  }

  const connected = !!connection;

  return (
    <>
      <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Linkedin className="h-5 w-5" />
            <div>
              <div className="text-sm font-medium">LinkedIn</div>
              <div className="text-xs text-muted-foreground">Connect via OpenID Connect</div>
            </div>
          </div>
          {connectionLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : connected ? (
            <StatusBadge variant="verified" icon={<ShieldCheck className="h-3 w-3" />}>
              Connected
            </StatusBadge>
          ) : (
            <StatusBadge variant="outline">Not connected</StatusBadge>
          )}
        </div>

        {connected && connection ? (
          <div className="flex items-center gap-3">
            {connection.avatar_url ? (
              <img
                src={connection.avatar_url}
                alt=""
                className="h-10 w-10 rounded-full border object-cover"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">
                {connection.display_name ?? "LinkedIn account connected"}
              </div>
              {connection.email ? (
                <p className="text-xs text-muted-foreground truncate">{connection.email}</p>
              ) : null}
              {connection.profile_url ? (
                <a
                  href={connection.profile_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline truncate block"
                >
                  {connection.profile_url}
                </a>
              ) : (
                <p className="text-xs text-muted-foreground">LinkedIn account connected</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Authorize SIJIL to link your LinkedIn account. Manual URL entry is not permitted.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {connected ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={connecting || disconnecting}
                onClick={() => void handleConnectLinkedIn()}
              >
                {connecting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    Connecting LinkedIn...
                  </>
                ) : (
                  "Reconnect"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={connecting || disconnecting}
                onClick={() => setDisconnectOpen(true)}
                className="text-destructive hover:text-destructive"
              >
                <Unlink className="h-3.5 w-3.5 mr-1" />
                Disconnect
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={connecting || connectionLoading}
              onClick={() => void handleConnectLinkedIn()}
            >
              {connecting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  Connecting LinkedIn...
                </>
              ) : (
                "Connect LinkedIn"
              )}
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect LinkedIn?</AlertDialogTitle>
            <AlertDialogDescription>
              Your LinkedIn account will be unlinked from SIJIL. Your other profile details will not
              be changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={disconnecting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDisconnect();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
