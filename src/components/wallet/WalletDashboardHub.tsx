import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Award, CheckCircle2, Copy, Fingerprint, KeyRound, Layers, LockKeyhole, Share2, ShieldCheck, Unlock, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSsiIdentity } from "@/hooks/useSsiIdentity";
import { toast } from "@/hooks/use-toast";
import type { SsiUiStatus } from "@/lib/ssi/ownership";

export type WalletHubCredential = {
  id: string;
  name: string;
};

function identityStatusLabel(status: SsiUiStatus): string {
  if (status === "active") return "Active";
  if (status === "locked") return "Locked";
  if (status === "key_unavailable") return "Restore needed";
  if (status === "unsupported") return "Unavailable";
  return "Not set up";
}

function shortDid(did: string): string {
  if (did.length <= 24) return did;
  return `${did.slice(0, 16)}…${did.slice(-6)}`;
}

export function WalletDashboardHub({
  credentials,
  credentialsLoading,
  onShare,
  onManage,
  onGetProof,
  onCredentialClick,
}: {
  credentials: WalletHubCredential[];
  credentialsLoading: boolean;
  onShare: () => void;
  onManage: () => void;
  onGetProof: () => void;
  onCredentialClick?: (name: string, id: string) => void;
}) {
  const { snapshot, loading, working, unlock } = useSsiIdentity();
  const [showUnlock, setShowUnlock] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const did = snapshot.local?.did ?? snapshot.server.did;
  const status = snapshot.status;
  const active = status === "active";

  const unlockIdentity = async () => {
    try {
      await unlock(passphrase);
      setPassphrase("");
      setShowUnlock(false);
      toast({ title: "Wallet unlocked" });
    } catch (unlockError) {
      toast({
        title: "Could not unlock",
        description: unlockError instanceof Error ? unlockError.message : "Unlock failed.",
        variant: "destructive",
      });
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl bg-[#faf7ff] shadow-sm" aria-label="Secure wallet">
      <div className="bg-gradient-to-br from-[#f9f6ff] via-[#f4eeff] to-[#e8ddff] px-5 pb-5 pt-4 sm:px-8">
        <Link to="/learner/dashboard" className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-[#4c1bb5]"><ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard</Link>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="inline-flex rounded-full bg-[#e7d9fc] px-2.5 py-1 text-[10px] font-bold uppercase text-[#281452]">SIJIL wallet</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#171034] sm:text-4xl">My Secure <span className="text-[#581acc]">Wallet</span></h1>
          </div>
          <div aria-hidden="true" className="mr-4 hidden rotate-[-9deg] rounded-3xl bg-gradient-to-br from-[#a278f2] to-[#5418ba] p-4 text-white shadow-lg sm:block lg:mr-16">
            <Wallet className="h-14 w-14" strokeWidth={1.5} />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-[hsl(var(--sijil-blue)/0.08)] bg-white/90 p-4 sm:flex-row sm:items-center">
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white ${active ? "bg-[#059669]" : "bg-[#4f46e5]"}`}>
            {active ? <ShieldCheck className="h-7 w-7" /> : <KeyRound className="h-7 w-7" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#0f172a]">Your Digital Identity</p>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <p className="truncate font-mono text-xs text-[#4b3973]">
                {loading ? "Checking this device…" : did ? shortDid(did) : "No identity on this account yet"}
              </p>
              {did ? <button type="button" aria-label="Copy identity identifier" className="rounded p-1 text-[#591ecc]" onClick={() => {
                void navigator.clipboard.writeText(did).then(() => toast({ title: "Identity identifier copied" }), () => toast({ title: "Could not copy identity identifier" }));
              }}><Copy className="h-4 w-4" /></button> : null}
            </div>
          </div>
          <Button type="button" variant="outline" className="rounded-xl border-[hsl(var(--sijil-blue)/0.15)] bg-white" onClick={onManage}>
            <Fingerprint className="h-4 w-4" />
            Manage Identity
          </Button>
        </div>

        {status === "locked" ? (
          <div className="mt-4 rounded-2xl border border-[#fed7aa] bg-[#fff7ed] px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[#9a3412]">This device is locked. You can browse achievements. Unlock to issue a credential or approve a share.</p>
              <Button type="button" size="sm" variant="outline" className="rounded-xl bg-white" onClick={() => setShowUnlock((open) => !open)}>
                <Unlock className="h-4 w-4" />
                Unlock Identity
              </Button>
            </div>
            {showUnlock ? (
              <form
                className="mt-3 flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  void unlockIdentity();
                }}
              >
                <label className="sr-only" htmlFor="hub-unlock-password">Recovery password</label>
                <Input
                  id="hub-unlock-password"
                  className="bg-white"
                  type="password"
                  autoComplete="current-password"
                  aria-label="Recovery password"
                  placeholder="Recovery password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                />
                <Button type="submit" className="rounded-xl" disabled={working || passphrase.length < 10}>
                  {working ? "Unlocking…" : "Unlock"}
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}

        {status === "not_activated" && !loading ? (
          <p className="mt-4 text-sm text-[#334155]">
            Set up a secure identity before you approve a share.{" "}
            <Link className="font-semibold text-sijil-blue underline" to="/learner/secure-identity">Set up my secure identity</Link>
          </p>
        ) : null}

        {status === "key_unavailable" && !loading ? (
          <p className="mt-4 text-sm text-[#9a3412]">
            This browser does not have the key for your identity. A new identity will not be created.{" "}
            <button type="button" className="font-semibold text-sijil-blue underline" onClick={onManage}>Restore from Manage Identity</button>
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 px-5 py-5 sm:grid-cols-2 sm:px-8">
        <article className="relative rounded-2xl border border-[#e5d8fc] bg-[#eee6fc] p-4 pl-16">
          <LockKeyhole aria-hidden="true" className="absolute left-4 top-4 h-9 w-9 rounded-xl bg-[#e4d5fc] p-2 text-[#591ecc]" />
          <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Identity on this device</p>
          <p className="mt-2 text-2xl font-semibold text-[#0f172a]">{loading ? "…" : identityStatusLabel(status)}</p>
        </article>
        <article className="relative rounded-2xl border border-[#e5d8fc] bg-[#eee6fc] p-4 pl-16">
          <Award aria-hidden="true" className="absolute left-4 top-4 h-9 w-9 rounded-xl bg-[#e4d5fc] p-2 text-[#591ecc]" />
          <p className="text-xs font-semibold uppercase tracking-wide text-[#4f46e5]">Achievements on your account</p>
          <p className="mt-2 text-2xl font-semibold text-[#0f172a]">{credentialsLoading ? "…" : credentials.length}</p>
          <p className="mt-1 text-xs text-[#475569]">Signed credentials already issued to this account.</p>
        </article>
      </div>

      <div className="grid gap-3 px-5 pb-2 sm:grid-cols-2 sm:px-8">
        <Button type="button" className="h-12 rounded-2xl bg-gradient-to-b from-[#7134e4] to-[#4a16aa] text-base text-white hover:brightness-95" onClick={onGetProof}>
          <Award className="h-4 w-4" />
          Get Verified Proof
        </Button>
        <Button type="button" variant="outline" className="h-12 rounded-2xl border-[hsl(var(--sijil-blue)/0.15)] bg-white text-base text-[#312e81]" onClick={onShare}>
          <Share2 className="h-4 w-4" />
          Share My Achievements
        </Button>
      </div>

      <div className="px-5 py-5 sm:px-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-[#171034]"><Layers className="h-4 w-4 text-[#591ecc]" /> Existing Achievements</h2>
        </div>
        {credentialsLoading ? <p className="text-sm text-[#64748b]">Checking issued credentials…</p> : null}
        {!credentialsLoading && credentials.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[hsl(var(--sijil-blue)/0.1)] bg-[#f8fafc] px-4 py-6 text-sm text-[#475569]">
            No signed achievements have been issued to this account yet. Get verified proof when SIJIL has already accepted your evidence.
          </p>
        ) : null}
        {!credentialsLoading && credentials.length > 0 ? (
          <ul className="grid gap-2">
            {credentials.slice(0, 3).map((credential) => (
              <li key={credential.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-2xl border border-[#e2e8f0] bg-white px-4 py-3 text-left transition hover:border-[#c4b5fd] hover:bg-[#faf8ff]"
                  onClick={() => onCredentialClick?.(credential.name, credential.id)}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fff7ed] text-[#c2410c]">
                    <Award className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#171034]">{credential.name}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#ddf5eb] px-2 py-1 text-xs font-semibold text-[#067a56]"><CheckCircle2 className="h-3 w-3" /> Issued</span>
                </button>
              </li>
            ))}
            {credentials.length > 3 ? (
              <li className="text-xs text-[#64748b]">{credentials.length - 3} more on your account.</li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
