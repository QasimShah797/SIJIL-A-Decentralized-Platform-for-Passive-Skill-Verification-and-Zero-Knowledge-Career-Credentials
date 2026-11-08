import { useState } from "react";
import { Link } from "react-router-dom";
import { Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { credentialStatusCopy, type BlockchainStatus, type HolderStatus, type RevocationStatus, type SignatureStatus } from "@/lib/credentials/portable";

export type CredentialCardModel = {
  id: string;
  skill: string;
  issuer: string;
  issued: string | null;
  expires: string | null;
  signature: SignatureStatus;
  revocation: RevocationStatus;
  blockchain: BlockchainStatus;
  holder: HolderStatus;
  canShare: boolean;
  hash: string | null;
  integrity: "ok" | "failed" | "unknown";
};

function readSelectedFile(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the credential file"));
    reader.readAsText(file);
  });
}

function signatureLabel(status: SignatureStatus): string {
  if (status === "valid") return "Matches the trusted issuer key";
  if (status === "invalid") return "Does not match";
  return "Could not check";
}

function revocationLabel(status: RevocationStatus): string {
  if (status === "active") return "Not revoked";
  if (status === "revoked") return "Revoked";
  return "Could not check";
}

function chainLabel(status: BlockchainStatus): string {
  if (status === "anchored") return "Record matches";
  if (status === "pending") return "Not ready";
  if (status === "missing") return "Missing";
  return "Could not check";
}

function formatDate(value: string | null): string {
  if (!value) return "Not included";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function LearnerCredentialCards({
  items,
  loading,
  importing,
  error,
  onDownload,
  onImport,
  onExportCollection,
  onShare,
}: {
  items: CredentialCardModel[];
  loading: boolean;
  importing: boolean;
  error: string | null;
  onDownload: (id: string) => void;
  onImport: (raw: string) => void;
  onExportCollection?: () => void;
  onShare?: (id: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = items.find((item) => item.id === openId) ?? null;

  return (
    <section id="my-achievements" className="space-y-4" aria-busy={loading || importing}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#0f172a]">My Verified Achievements</h2>
          <p className="mt-1 max-w-2xl text-sm text-[#475569]">
            These are the signed records already issued to you. A saved file shows what was signed. It does not by itself show that the record is still valid.
          </p>
        </div>
        {!loading ? (
          <p className="rounded-full bg-[#eff6ff] px-3 py-1 text-sm font-semibold text-[#023E8A]">
            {items.length} on this device
          </p>
        ) : null}
      </div>
      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {loading ? <p className="text-sm text-[#64748b]">Checking credentials…</p> : null}
      {!loading && items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#bfdbfe] bg-[#f8fafc] p-6 text-sm text-[#475569]">No verified achievements are saved on this device yet.</p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <article key={item.id} className="flex flex-col gap-3 rounded-2xl border border-[#dbeafe] bg-white p-4 shadow-sm">
            <header className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eff6ff] text-[#023E8A]">
                <Award className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-[#0f172a]">{item.skill}</h3>
                <p className="text-sm text-[#475569]">{item.issuer}</p>
              </div>
            </header>
            <dl className="grid grid-cols-2 gap-2 text-xs text-[#334155]">
              <div>
                <dt className="text-[#64748b]">Issued</dt>
                <dd>{formatDate(item.issued)}</dd>
              </div>
              <div>
                <dt className="text-[#64748b]">Expires</dt>
                <dd>{formatDate(item.expires)}</dd>
              </div>
            </dl>
            <p className="text-sm text-[#334155]">{credentialStatusCopy(item)}</p>
            <details className="text-xs text-[#334155]">
              <summary className="cursor-pointer font-medium text-[#023E8A]">Advanced details</summary>
              <dl className="mt-2 grid gap-1">
                <div><dt className="text-[#64748b]">Signature</dt><dd>{signatureLabel(item.signature)}</dd></div>
                <div><dt className="text-[#64748b]">Still valid</dt><dd>{revocationLabel(item.revocation)}</dd></div>
                <div><dt className="text-[#64748b]">Blockchain record</dt><dd>{chainLabel(item.blockchain)}</dd></div>
              </dl>
            </details>
            <div className="mt-auto flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => onDownload(item.id)}>Download</Button>
              <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => setOpenId(item.id)}>View details</Button>
              {item.canShare ? (
                <Button type="button" size="sm" className="rounded-xl" asChild>
                  <Link to={`/learner/credential/${encodeURIComponent(item.id)}/share`} onClick={() => onShare?.(item.id)}>Share</Link>
                </Button>
              ) : (
                <Button type="button" size="sm" className="rounded-xl" disabled>Share</Button>
              )}
            </div>
          </article>
        ))}
      </div>
      <details className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
        <summary className="cursor-pointer text-sm font-medium text-[#023E8A]">Saved files</summary>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="text-sm font-medium text-[#334155]">
            Import credential file
            <input
              className="mt-1 block w-full text-xs text-[#334155] file:mr-2 file:rounded-md file:border-0 file:bg-[#023E8A] file:px-2 file:py-1 file:text-xs file:text-white"
              type="file"
              accept="application/json,.json"
              disabled={importing}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void readSelectedFile(file).then(onImport);
              }}
            />
          </label>
          {onExportCollection ? (
            <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onExportCollection}>Download saved credentials</Button>
          ) : null}
        </div>
      </details>
      <Dialog open={Boolean(open)} onOpenChange={(next) => { if (!next) setOpenId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{open?.skill ?? "Credential"}</DialogTitle>
            <DialogDescription>
              {open ? credentialStatusCopy(open) : ""}
            </DialogDescription>
          </DialogHeader>
          {open ? (
            <dl className="space-y-2 text-sm">
              <div><dt className="text-[#64748b]">Issuer</dt><dd className="break-all">{open.issuer}</dd></div>
              <div><dt className="text-[#64748b]">Issued</dt><dd>{formatDate(open.issued)}</dd></div>
              <div><dt className="text-[#64748b]">Expires</dt><dd>{formatDate(open.expires)}</dd></div>
              <div><dt className="text-[#64748b]">Holder</dt><dd>{open.holder === "match" ? "Matches this account" : open.holder === "mismatch" ? "Different learning identity" : "Could not check"}</dd></div>
            </dl>
          ) : null}
          {open?.hash ? (
            <details className="text-xs">
              <summary className="cursor-pointer font-medium text-[#023E8A]">Record identifier</summary>
              <p className="mt-2 break-all font-mono">{open.id}</p>
              <p className="mt-1 break-all font-mono">{open.hash}</p>
            </details>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
