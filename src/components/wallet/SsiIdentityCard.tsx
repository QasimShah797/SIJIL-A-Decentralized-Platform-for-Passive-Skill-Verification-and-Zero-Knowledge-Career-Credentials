import { useState } from "react";
import { Copy, Fingerprint, KeyRound, Lock, ShieldCheck, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSsiIdentity } from "@/hooks/useSsiIdentity";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { SsiUiStatus } from "@/lib/ssi/ownership";

function statusLabel(status: SsiUiStatus): string {
  if (status === "active") return "Active";
  if (status === "locked") return "Locked";
  if (status === "key_unavailable") return "Key unavailable";
  if (status === "unsupported") return "Not activated";
  return "Not activated";
}

export function SsiIdentityCard() {
  const {
    snapshot,
    loading,
    working,
    error,
    recoverable,
    activate,
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
      toast({ title: "DID copied" });
    } catch {
      toast({ title: "Could not copy DID", variant: "destructive" });
    }
  };

  const handleActivate = async () => {
    try {
      await activate(passphrase.trim() ? passphrase : undefined);
      setPassphrase("");
      toast({
        title: "SSI identity activated",
        description: passphrase.trim()
          ? "The private key is passphrase-wrapped on this device. SIJIL cannot recover a forgotten passphrase."
          : "The private key stays on this device and is not exportable.",
      });
    } catch (activateError) {
      toast({
        title: "Could not activate SSI identity",
        description: activateError instanceof Error ? activateError.message : "Activation failed.",
        variant: "destructive",
      });
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

  return (
    <section className="learner-stat-card mb-4 space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-[#023E8A]">
            <KeyRound className="h-4 w-4" />
            SSI Identity
          </p>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            You control the Ed25519 private key on this browser. SIJIL never uploads the private key.
            Existing non-extractable keys cannot be exported. Passphrase-protected identities can be
            backed up as ciphertext only. Forgotten passphrases cannot be recovered.
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
            snapshot.status === "active" && "bg-[#ecfdf5] text-[#059669]",
            snapshot.status === "locked" && "bg-[#fff7ed] text-[#c2410c]",
            snapshot.status === "key_unavailable" && "bg-[#fff7ed] text-[#c2410c]",
            (snapshot.status === "not_activated" || snapshot.status === "unsupported") && "bg-[#f1f5f9] text-[#64748b]",
          )}
        >
          {snapshot.status === "active" ? <ShieldCheck className="h-3 w-3" /> : <Fingerprint className="h-3 w-3" />}
          {statusLabel(snapshot.status)}
        </span>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Checking this browser…</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{snapshot.message}</p>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          {did ? (
            <div className="space-y-1 rounded-xl border border-border/60 bg-background/70 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Learner DID</p>
              <p className="break-all font-mono text-xs text-foreground">{did}</p>
              {fingerprint ? (
                <p className="font-mono text-[11px] text-muted-foreground">Fingerprint · {fingerprint}</p>
              ) : null}
              <p className="font-mono text-[11px] text-muted-foreground">
                Verification method · {did}#{did.replace("did:key:", "")}
              </p>
            </div>
          ) : null}

          {(snapshot.status === "not_activated" || snapshot.status === "locked" || recoverable) ? (
            <Input
              type="password"
              placeholder={snapshot.status === "locked" ? "Passphrase to unlock" : "Optional passphrase (min 10 chars) for recoverable backup"}
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
          ) : null}

          <div className="flex flex-wrap gap-2">
            {snapshot.status === "not_activated" ? (
              <Button size="sm" disabled={working} onClick={() => void handleActivate()}>
                {working ? "Activating…" : "Activate SSI Identity"}
              </Button>
            ) : null}
            {snapshot.status === "locked" ? (
              <Button size="sm" disabled={working || passphrase.length < 10} onClick={() => void handleUnlock()}>
                <Unlock className="h-3.5 w-3.5" />
                Unlock
              </Button>
            ) : null}
            {snapshot.status === "active" && recoverable ? (
              <Button size="sm" variant="outline" onClick={() => lock()}>
                <Lock className="h-3.5 w-3.5" />
                Lock
              </Button>
            ) : null}
            <Button size="sm" variant="outline" disabled={!did} onClick={() => void copyDid()}>
              <Copy className="h-3.5 w-3.5" />
              Copy DID
            </Button>
            <Button size="sm" variant="outline" onClick={() => void handleBackup()}>
              Export encrypted backup
            </Button>
          </div>

          {snapshot.status === "active" && recoverable ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                type="password"
                placeholder="Current passphrase"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
              />
              <Input
                type="password"
                placeholder="New passphrase"
                value={nextPassphrase}
                onChange={(event) => setNextPassphrase(event.target.value)}
              />
              <Button size="sm" variant="outline" onClick={() => void handleChangePassphrase()}>
                Change passphrase
              </Button>
            </div>
          ) : null}

          {snapshot.status === "not_activated" || snapshot.status === "key_unavailable" ? (
            <div className="space-y-2">
              <textarea
                className="min-h-20 w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
                placeholder="Paste encrypted backup JSON to restore this account on this device"
                value={restoreText}
                onChange={(event) => setRestoreText(event.target.value)}
              />
              <Button size="sm" variant="outline" disabled={!restoreText || passphrase.length < 10} onClick={() => void handleRestore()}>
                Restore encrypted backup
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
