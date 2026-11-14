import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Fingerprint, KeyRound, Lock, ShieldCheck, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSsiIdentity } from "@/hooks/useSsiIdentity";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { SsiUiStatus } from "@/lib/ssi/ownership";

function statusLabel(status: SsiUiStatus): string {
  if (status === "active") return "Identity active";
  if (status === "locked") return "Locked";
  if (status === "key_unavailable") return "Restore needed";
  return "Not set up";
}

export function SsiIdentityCard() {
  const {
    snapshot,
    loading,
    working,
    error,
    recoverable,
    unlock,
    lock,
    exportBackup,
    restoreBackup,
    changePassphrase,
  } = useSsiIdentity();
  const did = snapshot.local?.did ?? snapshot.server.did;
  const fingerprint = snapshot.local?.fingerprint ?? snapshot.server.fingerprint;
  const [passphrase, setPassphrase] = useState("");
  const [nextPassphrase, setNextPassphrase] = useState("");
  const [restoreText, setRestoreText] = useState("");

  const copyDid = async () => {
    if (!did) return;
    try {
      await navigator.clipboard.writeText(did);
      toast({ title: "Identity identifier copied" });
    } catch {
      toast({ title: "Could not copy the identifier", variant: "destructive" });
    }
  };

  const handleUnlock = async () => {
    try {
      await unlock(passphrase);
      setPassphrase("");
      toast({ title: "Wallet unlocked" });
    } catch (unlockError) {
      toast({
        title: "Could not unlock",
        description: unlockError instanceof Error ? unlockError.message : "Unlock failed.",
        variant: "destructive",
      });
    }
  };

  const handleBackup = async () => {
    try {
      const backup = await exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "sijil-ssi-backup.json";
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: "Encrypted backup downloaded" });
    } catch (backupError) {
      toast({
        title: "Backup unavailable",
        description: backupError instanceof Error ? backupError.message : "Could not export backup.",
        variant: "destructive",
      });
    }
  };

  const handleRestore = async () => {
    try {
      await restoreBackup(restoreText, passphrase);
      setRestoreText("");
      setPassphrase("");
      toast({ title: "Encrypted backup restored" });
    } catch (restoreError) {
      toast({
        title: "Could not restore backup",
        description: restoreError instanceof Error ? restoreError.message : "Restore failed.",
        variant: "destructive",
      });
    }
  };

  const handleChangePassphrase = async () => {
    try {
      await changePassphrase(passphrase, nextPassphrase);
      setPassphrase("");
      setNextPassphrase("");
      toast({ title: "Passphrase updated" });
    } catch (changeError) {
      toast({
        title: "Could not change passphrase",
        description: changeError instanceof Error ? changeError.message : "Update failed.",
        variant: "destructive",
      });
    }
  };

  const locked = snapshot.status === "locked";

  return (
    <section className="overflow-hidden rounded-2xl border border-[#dbeafe] bg-white shadow-sm">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className={cn(
          "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-white",
          snapshot.status === "active" ? "bg-[#059669]" : "bg-[#023E8A]",
        )}>
          {snapshot.status === "active" ? <ShieldCheck className="h-8 w-8" /> : <KeyRound className="h-8 w-8" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#023E8A]">Digital identity</p>
          <h2 className="text-xl font-semibold text-[#0f172a]">Your identity on this device</h2>
          <p className="mt-1 text-sm leading-relaxed text-[#475569]">
            This identity approves shares from this browser. SIJIL never receives your private key.
          </p>
        </div>
        <span
          className={cn(
            "inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
            snapshot.status === "active" && "bg-[#ecfdf5] text-[#059669]",
            snapshot.status === "locked" && "bg-[#fff7ed] text-[#c2410c]",
            snapshot.status === "key_unavailable" && "bg-[#fff7ed] text-[#c2410c]",
            (snapshot.status === "not_activated" || snapshot.status === "unsupported") && "bg-[#f1f5f9] text-[#64748b]",
          )}
        >
          {snapshot.status === "active" ? <ShieldCheck className="h-3.5 w-3.5" /> : <Fingerprint className="h-3.5 w-3.5" />}
          {statusLabel(snapshot.status)}
        </span>
      </div>

      <div className="space-y-4 border-t border-[#e2e8f0] px-5 py-5">
        {loading ? <p className="text-sm text-[#64748b]">Checking this browser…</p> : null}
        {!loading && snapshot.message ? <p className="text-sm text-[#334155]">{snapshot.message}</p> : null}
        {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

        {locked ? (
          <div className="space-y-3 rounded-2xl border border-[#fed7aa] bg-[#fff7ed] p-4">
            <p className="text-sm font-medium text-[#9a3412]">Unlock to approve a share</p>
            <p className="text-sm text-[#9a3412]">
              This device is locked. Enter the recovery password you chose. SIJIL cannot reset it, and nothing is shared until you unlock.
            </p>
            <label className="block text-sm font-medium text-[#0f172a]" htmlFor="wallet-unlock-password">
              Recovery password
              <Input
                id="wallet-unlock-password"
                className="mt-1 bg-white"
                type="password"
                autoComplete="current-password"
                aria-label="Recovery password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
              />
            </label>
            <Button className="w-full rounded-xl sm:w-auto" disabled={working || passphrase.length < 10} onClick={() => void handleUnlock()}>
              <Unlock className="h-4 w-4" />
              Unlock Identity
            </Button>
          </div>
        ) : null}

        {snapshot.status === "not_activated" ? (
          <Button asChild className="rounded-xl">
            <Link to="/learner/secure-identity">Set up my secure identity</Link>
          </Button>
        ) : null}

        {snapshot.status === "key_unavailable" ? (
          <div className="space-y-3 rounded-2xl border border-[#fed7aa] bg-[#fff7ed] p-4">
            <p className="text-sm font-medium text-[#9a3412]">Restore this identity</p>
            <p className="text-sm text-[#9a3412]">
              This browser does not have the key for your identity. A new identity will not be created. Use the recovery file and the password you chose.
            </p>
            <label className="block text-sm font-medium text-[#0f172a]" htmlFor="restore-passphrase">
              Recovery password
              <Input
                id="restore-passphrase"
                className="mt-1 bg-white"
                type="password"
                aria-label="Recovery password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
              />
            </label>
            <textarea
              className="min-h-24 w-full rounded-xl border border-input bg-white p-3 text-sm"
              placeholder="Paste your recovery file here"
              value={restoreText}
              onChange={(event) => setRestoreText(event.target.value)}
            />
            <Button className="rounded-xl" disabled={!restoreText || passphrase.length < 10} onClick={() => void handleRestore()}>
              Restore Identity
            </Button>
          </div>
        ) : null}

        {snapshot.status === "active" ? (
          <div className="flex flex-wrap gap-2">
            {recoverable ? (
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => lock()}>
                <Lock className="h-3.5 w-3.5" />
                Lock
              </Button>
            ) : null}
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => void handleBackup()}>
              Download recovery file
            </Button>
          </div>
        ) : null}

        <details className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
          <summary className="cursor-pointer text-sm font-medium text-[#023E8A]">Recovery and advanced details</summary>
          <div className="mt-3 space-y-3">
            {snapshot.status !== "active" ? (
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => void handleBackup()}>
                Download recovery file
              </Button>
            ) : null}
            {snapshot.status === "not_activated" ? (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#0f172a]" htmlFor="setup-restore-password">
                  Recovery password
                  <Input
                    id="setup-restore-password"
                    className="mt-1 bg-white"
                    type="password"
                    aria-label="Recovery password"
                    value={passphrase}
                    onChange={(event) => setPassphrase(event.target.value)}
                  />
                </label>
                <textarea
                  className="min-h-24 w-full rounded-xl border border-input bg-white p-3 text-sm"
                  placeholder="Paste your recovery file here"
                  value={restoreText}
                  onChange={(event) => setRestoreText(event.target.value)}
                />
                <Button size="sm" variant="outline" className="rounded-xl" disabled={!restoreText || passphrase.length < 10} onClick={() => void handleRestore()}>
                  Restore Identity
                </Button>
              </div>
            ) : null}
            {snapshot.status === "active" && recoverable ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Input type="password" placeholder="Current passphrase" aria-label="Current passphrase" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} />
                <Input type="password" placeholder="New passphrase" aria-label="New passphrase" value={nextPassphrase} onChange={(event) => setNextPassphrase(event.target.value)} />
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => void handleChangePassphrase()}>
                  Change passphrase
                </Button>
              </div>
            ) : null}
            {did ? (
              <div>
                <p className="text-xs font-medium text-[#64748b]">Identifier</p>
                <p className="mt-1 break-all font-mono text-xs text-[#0f172a]">{did}</p>
                {fingerprint ? <p className="font-mono text-[11px] text-[#64748b]">Fingerprint · {fingerprint}</p> : null}
                <Button size="sm" variant="outline" className="mt-2 rounded-xl" disabled={!did} onClick={() => void copyDid()}>
                  <Copy className="h-3.5 w-3.5" />
                  Copy identifier
                </Button>
              </div>
            ) : null}
          </div>
        </details>
      </div>
    </section>
  );
}
