import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, BadgeCheck, Check, Contact, Database, Download, FileLock2, FolderDown, FolderLock,
  ChevronDown, ChevronRight, House, KeyRound, LockKeyhole, Monitor, Share2, Shield, ShieldCheck, Star, TriangleAlert, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/PasswordInput";
import type { EncryptedSsiBackup } from "@/lib/ssi/vault";
import { assertRecoveryDownloadAuthorized } from "@/lib/ssi/session";
import {
  identitySetupView,
  learnerIdentityError,
  recoveryFileIsWrapped,
  recoveryPasswordIssue,
  SSI_IDENTITY_LOOKUP_ERROR,
} from "@/lib/ssi/onboarding";
import type { SsiSnapshot } from "@/lib/ssi/ownership";
import "./SecureIdentityFlow.css";

type Step = "intro" | "choose" | "recovery" | "browser";

export function SecureIdentityFlow({
  snapshot,
  loading,
  working,
  recoverable,
  serverLookupFailed,
  onRetryLookup,
  onActivate,
  onFinish,
  onUnlock,
  onRestore,
  onDownload,
  onExport,
}: {
  snapshot: SsiSnapshot;
  loading: boolean;
  working: boolean;
  recoverable: boolean;
  serverLookupFailed?: boolean;
  onRetryLookup?: () => Promise<void>;
  onActivate: (passphrase?: string) => Promise<EncryptedSsiBackup | null>;
  onFinish: () => Promise<void>;
  onUnlock: (passphrase: string) => Promise<void>;
  onRestore: (raw: string, passphrase: string) => Promise<void>;
  onDownload: (backup: EncryptedSsiBackup) => void;
  onExport?: (password: string) => Promise<EncryptedSsiBackup>;
}) {
  const view = identitySetupView({
    loading,
    status: snapshot.status,
    serverDid: snapshot.server.did,
    serverLookupFailed,
  });
  const [step, setStep] = useState<Step>("intro");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [savedFile, setSavedFile] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [backup, setBackup] = useState<EncryptedSsiBackup | null>(null);
  const [reviewBackup, setReviewBackup] = useState(false);
  const [restoreText, setRestoreText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const busy = working || pending;
  const showChoice = view === "intro" ? step : view;

  const run = async (action: () => Promise<void>) => {
    if (inFlight.current || working) return;
    inFlight.current = true;
    setPending(true);
    setFormError(null);
    try {
      await action();
    } catch (error) {
      setFormError(learnerIdentityError(error));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const awaitingFile = Boolean(backup && !savedFile && snapshot.status !== "locked");
  const fileSavedPending = Boolean(backup && savedFile && view === "intro");
  const progressIndex: 0 | 1 | 2 = reviewBackup ? 1 : view === "ready" || view === "finish" || awaitingFile || fileSavedPending ? 2 : 0;
  const showSetupProgress = view === "intro" || view === "ready" || view === "finish" || awaitingFile;
  const showIntro = showChoice === "intro" && !awaitingFile;
  const showProtectionChoice = showChoice === "choose" && !awaitingFile;
  const showRecoveryPassword = showChoice === "recovery" && !awaitingFile && !fileSavedPending;
  const showReady = view === "ready" && (!backup || savedFile);
  const showUnlock = view === "unlock";
  const showStyledScreen = showIntro || showProtectionChoice || showRecoveryPassword || awaitingFile || showReady || showUnlock;

  return (
    <section className={`${showStyledScreen ? "ssi-entry max-w-4xl" : "max-w-3xl"} ${showUnlock ? "ssi-unlock" : ""} mx-auto w-full`} aria-busy={busy}>
      {formError && view !== "lookup_failed" && !showUnlock ? (
        <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {formError}
        </p>
      ) : null}

      {view === "lookup_failed" ? (
        <StepCard>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Could not check your identity</h1>
          <p role="alert" className="text-sm text-[#334155]">{SSI_IDENTITY_LOOKUP_ERROR}</p>
          <Button type="button" disabled={busy} onClick={() => onRetryLookup && void run(onRetryLookup)}>Try again</Button>
        </StepCard>
      ) : null}

      {view === "loading" ? <p className="text-sm text-[#64748b]">Checking this device…</p> : null}

      {view === "unsupported" ? (
        <StatusCard title="This browser cannot continue" body="This browser cannot store a learning identity. Try a current version of Chrome or Firefox." />
      ) : null}

      {showSetupProgress && view !== "unlock" && view !== "restore" && view !== "loading" && view !== "unsupported" ? (
        <Progress active={progressIndex} />
      ) : null}

      {showIntro ? (
        <div className="ssi-entry-card">
          <header className="ssi-entry-hero">
            <IdentityIllustration />
            <div className="ssi-entry-copy">
              <ShieldCheck aria-hidden="true" />
              <h1>Secure Identity</h1>
              <p>Prove your skills and learning with a secure digital identity.</p>
            </div>
          </header>
          <ul className="ssi-entry-benefits">
            <li><Database aria-hidden="true" /><span>You control<br />your data</span></li>
            <li><BadgeCheck aria-hidden="true" /><span>Get a<br />verified record</span></li>
            <li><Share2 aria-hidden="true" /><span>Share your<br />information safely</span></li>
          </ul>
          <Button type="button" className="ssi-entry-action" onClick={() => setStep("choose")} disabled={busy}>
            <ShieldCheck aria-hidden="true" />
            Set up my secure identity
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      {showProtectionChoice ? (
        <div className="ssi-entry-card ssi-protection-card">
          <header className="ssi-protection-heading">
            <span aria-hidden="true"><ShieldCheck /></span>
            <div>
              <h1>Choose how to protect this identity</h1>
              <p>Confirm a protection option to create your identity.</p>
            </div>
          </header>
          <div className="ssi-protection-options">
            <article className="ssi-protection-option ssi-protection-recommended">
              <div className="ssi-protection-summary">
                <div>
                  <span className="ssi-protection-tag"><Star aria-hidden="true" /> Recommended</span>
                  <h2>Save a recovery file</h2>
                  <p>Download an encrypted file and set a recovery password. Keep both somewhere safe, such as your personal drive.</p>
                </div>
                <div className="ssi-protection-art ssi-protection-file" aria-hidden="true">
                  <FileLock2 />
                  <span><Download /></span>
                </div>
              </div>
              <ProtectionBenefits items={[
                "Restore your identity on a new device or browser",
                "Keep a secure backup under your control",
                "Recover access after clearing browser data",
              ]} />
              <Button type="button" className="ssi-protection-primary" onClick={() => setStep("recovery")}>
                <Download aria-hidden="true" /> Create recovery file
              </Button>
            </article>
            <article className="ssi-protection-option">
              <div className="ssi-protection-summary ssi-protection-browser">
                <div className="ssi-protection-art" aria-hidden="true">
                  <div className="ssi-art-laptop"><ShieldCheck /></div>
                </div>
                <div>
                  <h2>This browser only</h2>
                  <p>Keep the identity in this browser. Clearing browser data or switching devices removes your ability to approve new shares.</p>
                </div>
              </div>
              <ProtectionBenefits items={[
                "Quick and simple setup",
                "Works only on this browser",
                "Cannot be restored on another device",
              ]} />
              <Button type="button" variant="outline" className="ssi-protection-secondary" onClick={() => setStep("browser")}>
                <Monitor aria-hidden="true" /> Use this browser only
              </Button>
            </article>
          </div>
          <footer className="ssi-protection-actions">
            <Button type="button" variant="outline" className="ssi-protection-back" onClick={() => setStep("intro")}>
              <ArrowLeft aria-hidden="true" /> Back
            </Button>
            <Button type="button" className="ssi-protection-primary" onClick={() => setStep("recovery")}>
              Continue <ArrowRight aria-hidden="true" />
            </Button>
          </footer>
        </div>
      ) : null}

      {showRecoveryPassword ? (
          <form
            className="ssi-entry-card ssi-recovery-card"
            onSubmit={(event) => {
              event.preventDefault();
              const issue = recoveryPasswordIssue(password, confirm);
              if (issue) {
                setFormError(issue);
                return;
              }
              void run(async () => {
                const created = await onActivate(password);
                setPassword("");
                setConfirm("");
                if (created) setBackup(created);
              });
            }}
          >
            <div className="ssi-recovery-main">
              <aside className="ssi-recovery-guide">
                <div className="ssi-identity-art ssi-recovery-art" aria-hidden="true">
                  <div className="ssi-art-laptop">
                    <LockKeyhole />
                    <span>✱ ✱ ✱ ✱</span>
                  </div>
                  <ShieldCheck className="ssi-recovery-art-shield" />
                </div>
                <div className="ssi-recovery-tips">
                  <h2><ShieldCheck aria-hidden="true" /> Password tips</h2>
                  <ProtectionBenefits items={[
                    "Use at least 10 characters",
                    "Use a mix of letters, numbers, and symbols (e.g., A, 1, @)",
                    "Choose a memorable phrase",
                    "Keep it private and do not share it",
                  ]} />
                </div>
              </aside>
              <div className="ssi-recovery-content">
                <header>
                  <span aria-hidden="true"><KeyRound /></span>
                  <h1>Create your recovery password</h1>
                  <p id="recovery-password-help">Set a strong password to protect your recovery file. You will need this password to restore your identity later.</p>
                </header>
                <div className="ssi-recovery-fields">
                  <div>
                    <Label htmlFor="recovery-password">Recovery password</Label>
                    <PasswordInput id="recovery-password" autoComplete="new-password" describedBy="recovery-password-help"
                      placeholder="Enter a strong password" value={password} onChange={setPassword} />
                  </div>
                  <div>
                    <Label htmlFor="recovery-password-confirm">Confirm recovery password</Label>
                    <PasswordInput id="recovery-password-confirm" autoComplete="new-password"
                      placeholder="Re-enter the same password" value={confirm} onChange={setConfirm} />
                  </div>
                </div>
              </div>
            </div>
            <footer className="ssi-protection-actions ssi-recovery-actions">
              <Button type="button" variant="outline" className="ssi-protection-back" onClick={() => setStep("choose")} disabled={busy}>
                <ArrowLeft aria-hidden="true" /> Back
              </Button>
              <Button type="submit" className="ssi-protection-primary" disabled={busy}>
                {busy ? "Securing…" : <>Create and continue <ArrowRight aria-hidden="true" /></>}
              </Button>
            </footer>
          </form>
      ) : null}

      {awaitingFile && reviewBackup ? (
        <StepCard>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Recovery password is set</h1>
          <p className="text-sm text-[#475569]">Your encrypted recovery file is ready. Continue to download and save it.</p>
          <Button type="button" className="ssi-protection-primary" onClick={() => setReviewBackup(false)}>Continue</Button>
        </StepCard>
      ) : null}

      {awaitingFile && backup && !reviewBackup ? (
        <div className="ssi-entry-card ssi-backup-card">
          <div className="ssi-backup-side">
            <div className="ssi-identity-art ssi-backup-art" aria-hidden="true">
              <div className="ssi-art-laptop">
                <FolderDown />
              </div>
              <ShieldCheck className="ssi-recovery-art-shield" />
            </div>
            <Button type="button" variant="outline" className="ssi-protection-back" onClick={() => setReviewBackup(true)}>
              <ArrowLeft aria-hidden="true" /> Back
            </Button>
          </div>
          <div className="ssi-backup-content">
            <header className="ssi-backup-heading">
              <span aria-hidden="true"><FolderLock /></span>
              <h1>Keep your identity safe</h1>
              <p>Follow these steps to keep your secure identity and access it later when needed.</p>
            </header>
            <ProtectionBenefits items={[
              "Download your backup file and store it somewhere you control.",
              "Use the recovery password with that file on a new device.",
            ]} />
            <div className="ssi-backup-warning">
              <TriangleAlert aria-hidden="true" />
              <div>
                <h2>Important</h2>
                <p>Download this file before you leave. If you lose it, you may be unable to recover your identity on a new device. Confirm below after saving the file. SIJIL cannot open the file or reset your password.</p>
              </div>
            </div>
            <Button type="button" className="ssi-protection-primary ssi-backup-download" onClick={() => void run(async () => {
              onDownload(backup);
              setDownloaded(true);
            })}>
              <ArrowDownToLine aria-hidden="true" /> Download recovery file
            </Button>
            <label className="ssi-backup-confirm">
              <input type="checkbox" checked={savedFile} onChange={(event) => setSavedFile(event.target.checked)} disabled={!downloaded} />
              <span>I have saved this file and I understand SIJIL cannot reset the recovery password.</span>
            </label>
          </div>
        </div>
      ) : null}

      {showChoice === "browser" && !awaitingFile ? (
        <StepCard>
          <h1 className="text-2xl font-semibold text-[#0f172a]">This browser only</h1>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!acknowledged) {
                setFormError("Please confirm that you understand a browser-only identity cannot be restored.");
                return;
              }
              void run(async () => {
                await onActivate(undefined);
              });
            }}
          >
            <label htmlFor="browser-only-risk" className="flex items-start gap-2 rounded-2xl border border-[#fed7aa] bg-[#fff7ed] p-4 text-sm text-[#9a3412]">
              <input id="browser-only-risk" type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
              I understand that clearing this browser’s data, or losing this device, means I cannot approve new shares, and that SIJIL cannot restore a browser-only identity.
            </label>
            <Button type="submit" className="h-11 w-full rounded-xl" disabled={busy || !acknowledged}>{busy ? "Securing…" : "Continue"}</Button>
          </form>
          <Button type="button" variant="ghost" onClick={() => setStep("choose")}>Back</Button>
        </StepCard>
      ) : null}

      {fileSavedPending ? (
        <StepCard>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Recovery file saved</h1>
          <p className="text-sm text-[#334155]">The file download is confirmed. This screen stays here until SIJIL connects the identity. It is not marked ready yet.</p>
        </StepCard>
      ) : null}

      {view === "finish" && !awaitingFile ? (
        <StepCard>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Finish connecting this identity</h1>
          <p className="text-sm text-[#334155]">This device already has your learning identity. Finish connecting it to your account. A new identity will not be created.</p>
          <Button type="button" className="h-11 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca]" disabled={busy} onClick={() => void run(onFinish)}>{busy ? "Finishing…" : "Finish setup"}</Button>
        </StepCard>
      ) : null}

      {showUnlock ? (
        <div className="ssi-entry-card ssi-unlock-card">
          <div className="ssi-unlock-guide">
            <div className="ssi-identity-art ssi-recovery-art ssi-unlock-art" aria-hidden="true">
              <div className="ssi-art-laptop"><LockKeyhole /><span>*****</span></div>
              <div className="ssi-recovery-art-shield"><Shield /><LockKeyhole /></div>
            </div>
            <aside className="ssi-recovery-tips">
              <h2>Why do I need a password here?</h2>
              <ProtectionBenefits items={[
                "To open and use your secure identity.",
                "To keep your identity safe from others.",
                "Only you can unlock it with this password.",
              ]} />
            </aside>
          </div>
          <div className="ssi-unlock-content ssi-recovery-content">
            <header>
              <span><LockKeyhole aria-hidden="true" /></span>
              <h1>Your Identity is Locked</h1>
              <p>Enter the recovery password you set earlier to unlock your identity and continue.</p>
            </header>
            <form
              className="ssi-recovery-fields ssi-unlock-form"
              onSubmit={(event) => {
                event.preventDefault();
                void run(() => onUnlock(password));
              }}
            >
              <div>
                <Label htmlFor="unlock-password">Recovery Password</Label>
                <PasswordInput
                  id="unlock-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={setPassword}
                  invalid={Boolean(formError)}
                  describedBy={formError ? "unlock-error" : undefined}
                />
                {formError ? <p id="unlock-error" role="alert" className="mt-2 text-sm text-red-800">{formError}</p> : null}
              </div>
              <Button type="submit" className="ssi-unlock-button" disabled={busy || password.length < 10}><LockKeyhole aria-hidden="true" /> {busy ? "Unlocking…" : "Unlock Identity"}</Button>
            </form>
            <details className="ssi-unlock-details">
              <summary><ChevronRight aria-hidden="true" /> More Information</summary>
              <p>SIJIL cannot reset your recovery password. Nothing is shared until you unlock.</p>
              <p className="break-all font-mono text-xs">{snapshot.local?.did ?? snapshot.server.did ?? "No identity identifier yet."}</p>
            </details>
          </div>
        </div>
      ) : null}

      {view === "restore" ? (
        <StepCard>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Restore your identity</h1>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                if (!restoreText.trim()) throw new Error("Choose a recovery file");
                if (!recoveryFileIsWrapped(restoreText)) throw new Error("Backup file is malformed");
                if (password.length < 10) throw new Error("Incorrect passphrase");
                await onRestore(restoreText, password);
                setRestoreText("");
                setPassword("");
              });
            }}
          >
            <p className="text-sm text-[#334155]">
              This account already has a learning identity, and this browser does not have its key. A new identity will not be created.
              If you downloaded a recovery file, choose it here. A browser-only identity cannot be restored.
            </p>
            <div className="space-y-1">
              <Label htmlFor="restore-file">Choose Recovery File</Label>
              <input
                id="restore-file"
                className="block w-full text-sm text-[#334155] file:mr-3 file:rounded-md file:border-0 file:bg-sijil-blue file:px-3 file:py-2 file:text-sm file:text-white"
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    setRestoreText("");
                    return;
                  }
                  void readSelectedFile(file).then(setRestoreText);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="restore-password">Enter Recovery Password</Label>
              <p id="restore-password-help" className="text-xs text-[#64748b]">
                SIJIL decrypts the file in this browser. A short password can be guessed offline by someone who has the file. SIJIL cannot reset it.
              </p>
              <Input id="restore-password" type="password" autoComplete="current-password" aria-describedby="restore-password-help" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <Button type="submit" className="h-11 rounded-xl" disabled={busy || !restoreText.trim() || password.length < 10}>
              {busy ? "Checking Your Identity" : "Restore My Learning Identity"}
            </Button>
          </form>
        </StepCard>
      ) : null}

      {showReady ? (
        <ReadyPanel
          recoverable={recoverable}
          did={snapshot.local?.did ?? snapshot.server.did}
          downloadBusy={busy}
          onDownloadAgain={snapshot.status === "active" && recoverable && !backup && onExport ? (recoveryPassword) => void run(async () => {
            const exported = await onExport(recoveryPassword);
            onDownload(exported);
          }) : undefined}
        />
      ) : null}
    </section>
  );
}

function ProtectionBenefits({ items }: { items: string[] }) {
  return (
    <ul className="ssi-protection-benefits">
      {items.map((item) => <li key={item}><span><Check aria-hidden="true" /></span>{item}</li>)}
    </ul>
  );
}

function readSelectedFile(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the recovery file"));
    reader.readAsText(file);
  });
}

function Progress({ active }: { active: 0 | 1 | 2 }) {
  const labels = ["Create Identity", "Save Backup", "Complete"];
  return (
    <ol className="ssi-progress mb-5 grid grid-cols-3 gap-2" aria-label="Setup progress">
      {labels.map((label, index) => {
        const current = index === active;
        const done = index < active;
        return (
          <li
            key={label}
            aria-current={current ? "step" : undefined}
            className={`rounded-2xl border px-2 py-3 text-center text-xs font-semibold ${current ? "border-[#4f46e5] bg-white text-[#312e81] shadow-sm" : "border-transparent text-[#64748b]"}`}
          >
            <span className={`mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full text-[11px] ${current || done ? "bg-[#4f46e5] text-white" : "bg-[#e2e8f0] text-[#475569]"}`}>
              {done ? <Check className="h-4 w-4" /> : index + 1}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function StepCard({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-[28px] border border-[hsl(var(--sijil-blue)/0.08)] bg-white px-5 py-8 text-left shadow-sm sm:px-8">
      {children}
    </div>
  );
}

function StatusCard({ title, body }: { title: string; body: string }) {
  return (
    <StepCard>
      <h1 className="text-2xl font-semibold text-[#0f172a]">{title}</h1>
      <p className="text-sm text-[#475569]">{body}</p>
    </StepCard>
  );
}

function IdentifierDetails({ did }: { did: string | null }) {
  return (
    <details className="rounded-2xl border border-[#e2e8f0] p-3 text-sm">
      <summary className="cursor-pointer font-medium text-sijil-blue">Advanced details</summary>
      <p className="mt-2 break-all font-mono text-xs text-[#475569]">{did ?? "No identity identifier yet."}</p>
    </details>
  );
}

function IdentityIllustration() {
  return (
    <div className="ssi-identity-art" aria-hidden="true">
      <div className="ssi-art-laptop"><ShieldCheck /></div>
      <div className="ssi-art-contact"><Contact /></div>
      <div className="ssi-art-lock"><LockKeyhole /></div>
    </div>
  );
}

function ReadyPanel({
  recoverable,
  did,
  onDownloadAgain,
  downloadBusy,
}: {
  recoverable: boolean;
  did: string | null;
  onDownloadAgain?: (password: string) => void;
  downloadBusy: boolean;
}) {
  const [recoveryPassword, setRecoveryPassword] = useState("");
  return (
    <div className="ssi-entry-card ssi-ready-card">
      <div className="ssi-ready-hero">
        <IdentityIllustration />
        <div className="ssi-ready-copy">
          <span className="ssi-ready-check"><Check aria-hidden="true" /></span>
          <h2>Your Secure Identity Is Ready!</h2>
          <p>Your secure identity (DID) has been created successfully.</p>
          <p>
            {recoverable
              ? "Keep your recovery file and password safe. SIJIL cannot open them or reset the password."
              : "Keep using this browser to approve shares. Clearing its data or losing this device removes access to your local key."}
          </p>
          <ul className="ssi-ready-status">
            <li><ShieldCheck aria-hidden="true" /><span>Your identity<br /><strong>is created</strong></span></li>
            <li><FolderDown aria-hidden="true" /><span>{recoverable ? "Backup file" : "Identity saved"}<br /><strong>{recoverable ? "is available" : "in this browser only"}</strong></span></li>
            <li><LockKeyhole aria-hidden="true" /><span>You are in<br /><strong>control of your data</strong></span></li>
          </ul>
        </div>
      </div>
      <nav className="ssi-ready-actions" aria-label="Continue">
        <Button asChild className="ssi-ready-primary">
          <Link to="/learner/dashboard"><House aria-hidden="true" /> Continue to Dashboard <ArrowRight aria-hidden="true" /></Link>
        </Button>
        <Button asChild variant="outline"><Link to="/learner/wallet"><Wallet aria-hidden="true" /> Open Wallet</Link></Button>
        <Button asChild variant="outline"><Link to="/learner/secure-identity"><ShieldCheck aria-hidden="true" /> Privacy &amp; Security</Link></Button>
      </nav>
      <details className="ssi-ready-details">
        <summary><ChevronDown aria-hidden="true" /> Advanced details</summary>
        <p className="break-all font-mono text-xs">{did ?? "No identity identifier yet."}</p>
        {onDownloadAgain ? (
          <form className="grid gap-2 px-4 pb-3" onSubmit={(event) => {
            event.preventDefault();
            if (downloadBusy || recoveryPassword.length < 10) return;
            onDownloadAgain(recoveryPassword);
            setRecoveryPassword("");
          }}>
            <Label htmlFor="ready-recovery-password">Recovery password</Label>
            <PasswordInput id="ready-recovery-password" value={recoveryPassword} onChange={setRecoveryPassword} />
            <Button type="submit" variant="outline" disabled={downloadBusy || recoveryPassword.length < 10}>Download recovery file</Button>
          </form>
        ) : null}
      </details>
    </div>
  );
}

export function downloadRecoveryFile(backup: EncryptedSsiBackup): void {
  assertRecoveryDownloadAuthorized(backup);
  const raw = JSON.stringify(backup);
  if (!recoveryFileIsWrapped(raw)) {
    throw new Error("Refusing to download unprotected key material");
  }
  const blob = new Blob([raw], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sijil-learning-identity-recovery.json";
  link.click();
  URL.revokeObjectURL(url);
}
