import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, FolderLock, KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EncryptedSsiBackup } from "@/lib/ssi/vault";
import {
  identitySetupView,
  learnerIdentityError,
  recoveryFileIsWrapped,
  recoveryPasswordIssue,
} from "@/lib/ssi/onboarding";
import type { SsiSnapshot } from "@/lib/ssi/ownership";

type Step = "intro" | "choose" | "recovery" | "browser";

export function SecureIdentityFlow({
  snapshot,
  loading,
  working,
  recoverable,
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
  onActivate: (passphrase?: string) => Promise<EncryptedSsiBackup | null>;
  onFinish: () => Promise<void>;
  onUnlock: (passphrase: string) => Promise<void>;
  onRestore: (raw: string, passphrase: string) => Promise<void>;
  onDownload: (backup: EncryptedSsiBackup) => void;
  onExport?: () => Promise<EncryptedSsiBackup>;
}) {
  const view = identitySetupView({
    loading,
    status: snapshot.status,
    serverDid: snapshot.server.did,
  });
  const [step, setStep] = useState<Step>("intro");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [savedFile, setSavedFile] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [backup, setBackup] = useState<EncryptedSsiBackup | null>(null);
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

  const awaitingFile = Boolean(backup && !savedFile);
  const fileSavedPending = Boolean(backup && savedFile && view === "intro");
  const progressIndex: 0 | 1 | 2 = view === "ready" || view === "finish" ? 2 : awaitingFile || fileSavedPending ? 1 : 0;
  const showSetupProgress = view === "intro" || view === "ready" || view === "finish" || awaitingFile;

  return (
    <section className="mx-auto w-full max-w-3xl" aria-busy={busy}>
      {formError ? (
        <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {formError}
        </p>
      ) : null}

      {view === "loading" ? <p className="text-sm text-[#64748b]">Checking this device…</p> : null}

      {view === "unsupported" ? (
        <StatusCard title="This browser cannot continue" body="This browser cannot store a learning identity. Try a current version of Chrome or Firefox." />
      ) : null}

      {showSetupProgress && view !== "unlock" && view !== "restore" && view !== "loading" && view !== "unsupported" ? (
        <Progress active={progressIndex} />
      ) : null}

      {showChoice === "intro" && !awaitingFile ? (
        <StepCard>
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#eef2ff] text-[#4f46e5]">
            <ShieldCheck className="h-10 w-10" />
          </div>
          <h1 className="text-center text-3xl font-semibold text-[#0f172a]">Secure Identity</h1>
          <p className="text-center text-sm leading-relaxed text-[#475569]">
            Own your learning achievements with a secure digital identity. You do not need to understand the cryptography.
          </p>
          <div className="rounded-2xl bg-[#eff6ff] p-4 text-left">
            <h2 className="text-sm font-semibold text-[#023E8A]">In simple words</h2>
            <ul className="mt-2 space-y-1 text-sm text-[#1e3a8a]">
              <li>Keep proof of your skills and learning.</li>
              <li>Get a verified record when SIJIL has already accepted your evidence.</li>
              <li>Share only what you choose with an employer.</li>
            </ul>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-semibold text-[#312e81]">
            <span className="rounded-2xl bg-[#eef2ff] px-2 py-3">Own your data</span>
            <span className="rounded-2xl bg-[#eef2ff] px-2 py-3">Get verified proof</span>
            <span className="rounded-2xl bg-[#eef2ff] px-2 py-3">Share safely</span>
          </div>
          <Button type="button" className="h-12 rounded-2xl bg-[#4f46e5] hover:bg-[#4338ca]" onClick={() => setStep("choose")} disabled={busy}>
            Set up my secure identity
          </Button>
        </StepCard>
      ) : null}

      {showChoice === "choose" && !awaitingFile ? (
        <StepCard>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Choose how to protect this identity</h1>
          <p className="text-sm text-[#475569]">A new identity is not created until you confirm one of these choices.</p>
          <article className="space-y-3 rounded-2xl border border-[#c7d2fe] bg-[#eef2ff] p-5">
            <h2 className="text-lg font-semibold text-[#312e81]">Recommended: save a recovery file</h2>
            <p className="text-sm text-[#3730a3]">
              You choose a recovery password. SIJIL downloads an encrypted file. Keep both the file and the password somewhere you control, such as a personal drive. SIJIL cannot reset a forgotten recovery password, and cannot open the file.
            </p>
            <Button type="button" className="rounded-xl bg-[#4f46e5] hover:bg-[#4338ca]" onClick={() => setStep("recovery")}>Create recovery file</Button>
          </article>
          <article className="space-y-3 rounded-2xl border border-[#e2e8f0] bg-white p-5">
            <h2 className="text-lg font-semibold text-[#0f172a]">This Browser Only</h2>
            <p className="text-sm text-[#475569]">
              The identity stays in this browser. If you clear browser data or lose this device, you lose the ability to approve new shares. SIJIL cannot restore a browser-only identity.
            </p>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setStep("browser")}>Use this browser only</Button>
          </article>
          <Button type="button" variant="ghost" onClick={() => setStep("intro")}>Back</Button>
        </StepCard>
      ) : null}

      {showChoice === "recovery" && !awaitingFile && !fileSavedPending ? (
        <StepCard>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#eef2ff] text-[#4f46e5]">
            <KeyRound className="h-8 w-8" />
          </div>
          <h1 className="text-center text-2xl font-semibold text-[#0f172a]">Create your recovery password</h1>
          <form
            className="space-y-3"
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
            <div className="space-y-1">
              <Label htmlFor="recovery-password">Recovery password</Label>
              <p id="recovery-password-help" className="text-xs text-[#64748b]">
                Use at least 10 characters. A memorable phrase is safer than a short password. Someone who has the recovery file can try passwords offline. SIJIL cannot reset a forgotten password.
              </p>
              <Input id="recovery-password" type="password" autoComplete="new-password" aria-describedby="recovery-password-help" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="recovery-password-confirm">Confirm recovery password</Label>
              <Input id="recovery-password-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
            </div>
            <Button type="submit" className="h-11 w-full rounded-xl bg-[#4f46e5] hover:bg-[#4338ca]" disabled={busy}>{busy ? "Securing…" : "Create and continue"}</Button>
          </form>
          <Button type="button" variant="ghost" onClick={() => setStep("choose")}>Back</Button>
        </StepCard>
      ) : null}

      {awaitingFile && backup ? (
        <StepCard>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#eef2ff] text-[#4f46e5]">
            <FolderLock className="h-8 w-8" />
          </div>
          <h1 className="text-center text-2xl font-semibold text-[#0f172a]">Keep your identity safe</h1>
          <ol className="space-y-2 text-sm text-[#334155]">
            <li>1. Download your backup file and store it somewhere you control.</li>
            <li>2. Use the recovery password with that file on a new device.</li>
          </ol>
          <p className="rounded-2xl border border-[#fed7aa] bg-[#fff7ed] p-4 text-sm text-[#9a3412]">
            Important: download this file before you leave. If you lose the file, you may not be able to recover this identity on a new device. Saving the file does not finish setup until you confirm below. SIJIL cannot open the file or reset the password.
          </p>
          <Button
            type="button"
            className="h-11 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca]"
            onClick={() => {
              onDownload(backup);
              setDownloaded(true);
            }}
          >
            Download recovery file
          </Button>
          <label className="flex items-start gap-2 text-sm text-[#1e3a8a]">
            <input type="checkbox" checked={savedFile} onChange={(event) => setSavedFile(event.target.checked)} disabled={!downloaded} />
            I have saved this file and I understand SIJIL cannot reset the recovery password.
          </label>
        </StepCard>
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

      {view === "unlock" ? (
        <StepCard>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Your identity is locked</h1>
          <p className="text-sm text-[#475569]">Enter the recovery password you chose. SIJIL cannot reset it. Nothing is shared until you unlock.</p>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => onUnlock(password));
            }}
          >
            <Label htmlFor="unlock-password">Recovery password</Label>
            <Input id="unlock-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <Button type="submit" className="h-11 rounded-xl" disabled={busy || password.length < 10}>{busy ? "Unlocking…" : "Unlock Identity"}</Button>
          </form>
          <IdentifierDetails did={snapshot.local?.did ?? snapshot.server.did} />
        </StepCard>
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
                className="block w-full text-sm text-[#334155] file:mr-3 file:rounded-md file:border-0 file:bg-[#023E8A] file:px-3 file:py-2 file:text-sm file:text-white"
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

      {view === "ready" && !formError && (!backup || savedFile) ? (
        <ReadyPanel
          recoverable={recoverable}
          did={snapshot.local?.did ?? snapshot.server.did}
          onDownloadAgain={recoverable && !backup && onExport ? () => void run(async () => {
            const exported = await onExport();
            onDownload(exported);
          }) : undefined}
        />
      ) : null}
    </section>
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
    <ol className="mb-5 grid grid-cols-3 gap-2" aria-label="Setup progress">
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
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-[28px] border border-[#e0e7ff] bg-white px-5 py-8 text-left shadow-sm sm:px-8">
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
      <summary className="cursor-pointer font-medium text-[#023E8A]">Advanced details</summary>
      <p className="mt-2 break-all font-mono text-xs text-[#475569]">{did ?? "No identity identifier yet."}</p>
    </details>
  );
}

function ReadyPanel({
  recoverable,
  did,
  onDownloadAgain,
}: {
  recoverable: boolean;
  did: string | null;
  onDownloadAgain?: () => void;
}) {
  return (
    <StepCard>
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#ecfdf5] text-[#059669]">
        <Check className="h-10 w-10" />
      </div>
      <h2 className="text-center text-2xl font-semibold text-[#064e3b]">Your Secure Identity Is Ready</h2>
      <p className="text-center text-sm text-[#065f46]">
          {recoverable
            ? "Keep your recovery file and password. SIJIL cannot open them or reset the password. A person who has the file can try passwords offline."
            : "This identity stays in this browser only. Clearing this browser’s data, or losing this device, removes the ability to approve new shares. This key cannot be exported or moved to a recovery file. SIJIL will not create a replacement identity."}
      </p>
      {onDownloadAgain ? (
        <Button type="button" variant="outline" className="rounded-xl" onClick={onDownloadAgain}>Download recovery file</Button>
      ) : null}
      <Button asChild className="h-11 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca]">
        <Link to="/learner/wallet">Go to My Secure Wallet</Link>
      </Button>
      <nav className="flex flex-col gap-2 text-center" aria-label="Continue">
        <Link className="text-sm font-medium text-[#023E8A] underline" to="/learner/profile">My Learning Journey</Link>
        <Link className="text-sm font-medium text-[#023E8A] underline" to="/learner/secure-identity">Privacy & Security</Link>
      </nav>
      <IdentifierDetails did={did} />
    </StepCard>
  );
}

export function downloadRecoveryFile(backup: EncryptedSsiBackup): void {
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
