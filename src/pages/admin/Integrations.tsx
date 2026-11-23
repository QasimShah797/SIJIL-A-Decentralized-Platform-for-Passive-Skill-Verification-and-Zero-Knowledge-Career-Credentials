import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, Link2, Link2Off, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  disconnectGoogleCalendarApi,
  getGoogleCalendarStatusApi,
  startGoogleCalendarConnectApi,
  type GoogleCalendarStatus,
} from "@/services/api/google-calendar.api";
import { isApiEnabled } from "@/services/api/client";
import sijilLogo from "@/assets/sijil-logo.png";

function statusLabel(status: GoogleCalendarStatus | null): string {
  if (!status) return "Unknown";
  if (status.connected && status.tokenStatus === "active") return "Connected";
  if (status.tokenStatus === "needs_reauth") return "Needs re-authorization";
  if (status.tokenStatus === "revoked") return "Revoked";
  return "Not connected";
}

export default function AdminIntegrations() {
  const { user, signOut } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!isApiEnabled()) {
      setStatus(null);
      setLoading(false);
      toast({
        title: "Backend not configured",
        description: "Set VITE_API_BASE_URL to the Desktop Credentials-1 API (http://localhost:5000/api).",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const next = await getGoogleCalendarStatusApi();
      setStatus(next);
    } catch (err) {
      setStatus(null);
      toast({
        title: "Could not load Calendar status",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const result = searchParams.get("googleCalendar");
    if (!result) return;
    const reason = searchParams.get("reason");
    if (result === "success") {
      toast({ title: "Google Calendar connected" });
    } else {
      toast({
        title: "Google Calendar connect failed",
        description: reason || "Authorization did not complete.",
        variant: "destructive",
      });
    }
    const next = new URLSearchParams(searchParams);
    next.delete("googleCalendar");
    next.delete("reason");
    setSearchParams(next, { replace: true });
    void refreshStatus();
  }, [searchParams, setSearchParams, refreshStatus]);

  async function onConnect() {
    setBusy(true);
    try {
      const { authorizeUrl } = await startGoogleCalendarConnectApi();
      if (!authorizeUrl || !/^https:\/\/accounts\.google\.com\//.test(authorizeUrl)) {
        throw new Error("Invalid authorization URL from the API.");
      }
      // Navigate only after an explicit admin click — do not auto-trigger OAuth.
      window.location.assign(authorizeUrl);
    } catch (err) {
      toast({
        title: "Could not start Google authorization",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
      setBusy(false);
    }
  }

  async function onDisconnect() {
    setBusy(true);
    try {
      await disconnectGoogleCalendarApi();
      toast({ title: "Google Calendar disconnected" });
      await refreshStatus();
    } catch (err) {
      toast({
        title: "Disconnect failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  const connected = Boolean(status?.connected);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/30">
      <header className="border-b border-border/60 bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/admin/integrations" className="flex items-center gap-3">
            <img src={sijilLogo} alt="SIJIL" className="h-10 w-10 object-contain" />
            <div>
              <p className="text-sm font-semibold tracking-tight">SIJIL Admin</p>
              <p className="text-xs text-muted-foreground">Integrations</p>
            </div>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{user?.email}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8">
          <p className="text-sm font-medium text-muted-foreground">Platform integrations</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Google Calendar</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Connect the SIJIL administrator Google account used for Calendar. Recruiters and learners
            cannot access this page. Tokens stay on the backend and are never shown here.
          </p>
        </div>

        <section className="rounded-2xl border border-border/70 bg-card/95 p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarDays className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold tracking-tight">SIJIL Calendar owner</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Status: <span className="font-medium text-foreground">{loading ? "Loading…" : statusLabel(status)}</span>
              </p>
              {status?.googleEmail ? (
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  Google account: <span className="text-foreground">{status.googleEmail}</span>
                </p>
              ) : null}
              {status?.connectedAt ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Connected at {new Date(status.connectedAt).toLocaleString()}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void onConnect()} disabled={busy || loading}>
              <Link2 className="mr-2 h-4 w-4" />
              {connected ? "Reconnect Google Calendar" : "Connect Google Calendar"}
            </Button>
            {connected || status?.tokenStatus ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void onDisconnect()}
                disabled={busy || loading}
              >
                <Link2Off className="mr-2 h-4 w-4" />
                Disconnect
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={() => void refreshStatus()}
              disabled={busy || loading}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
