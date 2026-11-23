import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Copy, FolderLock, Info, KeyRound, Lock, RefreshCw, Share2, ShieldCheck, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { downloadRecoveryFile } from "@/components/identity/SecureIdentityFlow";
import { learnerIdentityError } from "@/lib/ssi/onboarding";
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

export function SsiIdentityCard({ onBack }: { onBack: () => void }) {
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
    refresh,
  } = useSsiIdentity();
  const did = snapshot.local?.did ?? snapshot.server.did;
  const fingerprint = snapshot.local?.fingerprint ?? snapshot.server.fingerprint;
  const [passphrase, setPassphrase] = useState("");
  const [nextPassphrase, setNextPassphrase] = useState("");
  const [restoreText, setRestoreText] = useState("");
  const [exportPassword, setExportPassword] = useState("");
  const [exporting, setExporting] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

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
    if (unlocking || passphrase.length < 10) return;
    setUnlocking(true);
    const password = passphrase;
    setPassphrase("");
    try {
      await unlock(password);
      toast({ title: "Wallet unlocked" });
    } catch (unlockError) {
      toast({
        title: "Could not unlock",
        description: unlockError instanceof Error ? unlockError.message : "Unlock failed.",
        variant: "destructive",
      });
    } finally {
      setUnlocking(false);
    }
  };

  const handleBackup = async () => {
    if (exporting || loading || snapshot.status !== "active" || !recoverable || exportPassword.length < 10) return;
    const password = exportPassword;
    setExportPassword("");
    setExporting(true);
    try {
      downloadRecoveryFile(await exportBackup(password));
      toast({ title: "Encrypted backup downloaded" });
    } catch (backupError) {
      toast({
        title: "Backup unavailable",
        description: learnerIdentityError(backupError),
        variant: "destructive",
      });
    } finally {
      setExporting(false);
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
    <section className="mx-auto grid w-full max-w-6xl gap-5" aria-label="Manage Identity">
      <nav className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-semibold text-sijil-blue"><ArrowLeft className="h-4 w-4" /> Back to My Secure Wallet</button>
        <Button type="button" size="sm" variant="outline" onClick={() => void refresh()} disabled={loading || working}><RefreshCw className="h-4 w-4" /> Refresh</Button>
      </nav>
      <header className="flex items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-sijil-blue text-white"><KeyRound aria-hidden="true" className="h-7 w-7" /></span>
        <div>
          <h1 className="text-2xl font-bold text-[#0f172a]">Manage Identity</h1>
          <p className="text-sm text-[#475569]">Secure your digital identity, which is used to sign credentials and approve sharing.</p>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-sijil-blue/10 bg-gradient-to-r from-white to-sijil-blue/5 p-5 shadow-sm sm:flex-nowrap">
        <div className={cn(
          "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-white",
          snapshot.status === "active" ? "bg-[#059669]" : locked ? "bg-[#fee8e2] text-[#b93822]" : "bg-sijil-blue",
        )}>
          {snapshot.status === "active" ? <ShieldCheck className="h-8 w-8" /> : <Lock className="h-8 w-8" />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold text-[#0f172a]">Your Identity
            {locked ? <span className="rounded-full bg-[#fee8e2] px-2.5 py-1 text-sm text-[#b93822]">Locked</span> : <span className="text-sm text-sijil-blue">{loading ? "Checking…" : statusLabel(snapshot.status)}</span>}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[#475569]">
            {locked ? "Unlock your identity with your recovery password to sign credentials, approve sharing, or manage recovery." : "This identity is managed on this device."}
          </p>
        </div>
        <ShieldCheck aria-hidden="true" className="hidden h-16 w-16 shrink-0 text-sijil-blue sm:block" />
      </div>

      <div className="space-y-4">
        {loading ? <p className="text-sm text-[#64748b]">Checking this browser…</p> : null}
        {!loading && !locked && snapshot.message ? <p className="text-sm text-[#334155]">{snapshot.message}</p> : null}
        {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

        {locked ? (
          <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
            <form className="grid gap-4 rounded-xl border border-sijil-blue/15 bg-white p-5 shadow-sm" onSubmit={(event) => {
              event.preventDefault();
              void handleUnlock();
            }}>
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sijil-blue/10 text-sijil-blue"><Lock className="h-5 w-5" aria-hidden="true" /></span>
                <div><h2 className="font-bold">Unlock Identity</h2><p className="text-sm text-[#475569]">Enter your recovery password to access identity actions.</p></div>
              </div>
              <div className="grid gap-1">
                <label className="text-sm font-semibold" htmlFor="wallet-unlock-password">Recovery Password</label>
                <PasswordInput id="wallet-unlock-password" placeholder="Enter your recovery password" value={passphrase} onChange={setPassphrase} disabled={unlocking} />
              </div>
              <Button type="submit" className="w-full rounded-xl bg-sijil-blue text-white hover:bg-sijil-blue/90" disabled={unlocking || working || passphrase.length < 10}>
                <Unlock className="h-4 w-4" /> {unlocking ? "Unlocking…" : "Unlock Identity"}
              </Button>
            </form>
            <aside className="rounded-xl border border-sijil-blue/15 bg-white p-5 shadow-sm">
              <h2 className="font-bold">What you can do after unlocking</h2>
              <ul className="mt-3 grid gap-3">
                {[
                  { icon: ShieldCheck, title: "Sign new credentials", description: "Add signed achievements to your wallet." },
                  { icon: Share2, title: "Approve sharing", description: "Give permission to share your achievements." },
                  { icon: FolderLock, title: "Manage recovery", description: "Keep your identity recoverable." },
                ].map(({ icon: Icon, title, description }) => (
                  <li key={title} className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sijil-blue/10 text-sijil-blue"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                    <div className="text-sm"><strong>{title}</strong><p className="text-[#475569]">{description}</p></div>
                  </li>
                ))}
              </ul>
            </aside>
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

        {!loading && snapshot.status === "active" ? (
          <div className="grid justify-items-start gap-3 rounded-xl border border-sijil-blue/15 bg-white p-5">
            {recoverable ? (
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => { setExportPassword(""); lock(); }}>
                <Lock className="h-3.5 w-3.5" />
                Lock
              </Button>
            ) : null}
            {recoverable ? (
              <form className="grid w-full max-w-md gap-2" onSubmit={(event) => {
                event.preventDefault();
                void handleBackup();
              }}>
                <label className="text-sm font-semibold" htmlFor="wallet-export-password">Verify recovery password</label>
                <PasswordInput id="wallet-export-password" placeholder="Enter your recovery password" value={exportPassword} onChange={setExportPassword} disabled={exporting} />
                <Button type="submit" variant="outline" disabled={exporting || exportPassword.length < 10}>Download recovery file</Button>
              </form>
            ) : null}
          </div>
        ) : null}

        <details className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
          <summary className="cursor-pointer text-sm font-medium text-sijil-blue">Recovery and advanced details</summary>
          <div className="mt-3 space-y-3">
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
            {!loading && snapshot.status === "active" && recoverable ? (
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
      <p className="flex gap-2 rounded-xl border border-sijil-blue/10 bg-sijil-blue/5 p-3 text-sm text-sijil-blue"><Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> Keep your recovery password and recovery file safe and private.</p>
    </section>
  );
}
