import { useCallback, useEffect, useRef, useState } from "react";
import { LearnerCredentialCards, type CredentialCardModel } from "./LearnerCredentialCards";
import type { CredentialView } from "@/lib/db/credentials";
import {
  credentialDates,
  credentialFilename,
  credentialId,
  credentialIssuer,
  credentialSkill,
  holderBinding,
  interpretVerifyResponse,
  selectTrustedIssuerKey,
  serializePortableCredential,
  verifyPortableCredential,
  type PortableCredentialFile,
} from "@/lib/credentials/portable";
import { exportCredentialCollection, loadLocalCredentials, saveCredentialPayload, saveImportedCredential, type LocalCredentialRecord } from "@/lib/credentials/collection";
import { getCredentialDocumentApi, getTrustedIssuerKeyApi } from "@/services/api/credentials.api";
import { verifyCredentialLedgerApi } from "@/services/api/ledger.api";
import { useSsiIdentity } from "@/hooks/useSsiIdentity";

type CardSource = {
  id: string;
  file: PortableCredentialFile | null;
  issuerName: string | null;
  canShare: boolean;
};

function downloadText(filename: string, raw: string): void {
  const blob = new Blob([raw], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function LearnerCredentialWallet({
  userId,
  credentials,
}: {
  userId: string;
  credentials: CredentialView[];
}) {
  const identity = useSsiIdentity();
  const learnerDid = identity.snapshot.local?.did ?? identity.snapshot.server.did;
  const credentialsRef = useRef(credentials);
  credentialsRef.current = credentials;
  const credentialKey = credentials.map((item) => item.id).join("|");
  const [local, setLocal] = useState<LocalCredentialRecord[]>([]);
  const [files, setFiles] = useState<Record<string, PortableCredentialFile>>({});
  const [cards, setCards] = useState<CredentialCardModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const saved = await loadLocalCredentials(userId);
      setLocal(saved);
      const serverCredentials = credentialsRef.current;
      const byId = new Map<string, CardSource>();
      for (const record of saved) {
        byId.set(record.id, { id: record.id, file: record.file, issuerName: null, canShare: false });
      }
      const fetched: Record<string, PortableCredentialFile> = {};
      for (const credential of serverCredentials) {
        const file = await getCredentialDocumentApi(credential.id);
        if (file) fetched[credential.id] = file;
        const existing = byId.get(credential.id);
        byId.set(credential.id, {
          id: credential.id,
          file: file ?? existing?.file ?? null,
          issuerName: credential.issuer,
          canShare: true,
        });
      }
      setFiles(fetched);
      const keys = new Map<string, string | null>();
      const next: CredentialCardModel[] = [];
      for (const source of byId.values()) {
        const file = source.file;
        const issuerDid = file ? credentialIssuer(file) : "";
        if (file && issuerDid && !keys.has(issuerDid)) {
          keys.set(issuerDid, selectTrustedIssuerKey(file, await getTrustedIssuerKeyApi(issuerDid)));
        }
        const signature = file
          ? await verifyPortableCredential(file, issuerDid ? keys.get(issuerDid) ?? null : null)
          : "unavailable";
        const status = interpretVerifyResponse(await verifyCredentialLedgerApi(source.id));
        const dates = file ? credentialDates(file) : { issued: null, expires: null };
        const server = serverCredentials.find((credential) => credential.id === source.id);
        next.push({
          id: source.id,
          skill: file ? credentialSkill(file) : server?.skill || server?.name || "Achievement",
          issuer: source.issuerName || (file ? credentialIssuer(file) : "Unknown issuer"),
          issued: dates.issued ?? server?.validFrom ?? null,
          expires: dates.expires,
          signature,
          revocation: status.revocation,
          blockchain: status.blockchain,
          holder: file ? holderBinding(file, learnerDid) : "unknown",
          canShare: source.canShare,
          hash: file?.credentialHash ?? null,
          integrity: status.integrity,
        });
      }
      setCards(next);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Credentials could not be checked.");
    } finally {
      setLoading(false);
    }
  }, [credentialKey, learnerDid, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onDownload = async (id: string) => {
    setError(null);
    const file = files[id] ?? local.find((record) => record.id === id)?.file ?? null;
    if (!file || credentialId(file) !== id) {
      setError("This credential file is not available to download.");
      return;
    }
    try {
      const raw = serializePortableCredential(file);
      downloadText(credentialFilename(file), raw);
      const saved = await saveImportedCredential(userId, raw);
      if (saved.outcome === "saved") setLocal(await loadLocalCredentials(userId));
      if (saved.outcome === "conflict") {
        setError("The file downloaded. A different copy already saved on this device was not replaced.");
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The credential could not be downloaded.");
    }
  };

  const onImport = async (raw: string) => {
    setImporting(true);
    setError(null);
    try {
      const saved = await saveCredentialPayload(userId, raw);
      await refresh();
      if (saved.conflicts > 0) {
        setError("A different file is already saved for this credential. It was not replaced.");
      } else if (saved.saved === 0 && saved.duplicates > 0) {
        setError("This credential is already saved on this device. The saved copy was not changed.");
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "This credential file could not be imported.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <LearnerCredentialCards
      items={cards}
      loading={loading}
      importing={importing}
      error={error}
      onDownload={(id) => void onDownload(id)}
      onImport={(raw) => void onImport(raw)}
      onExportCollection={() => {
        const files = local.map((record) => record.file);
        if (!files.length) {
          setError("No credentials are saved on this device yet.");
          return;
        }
        downloadText("sijil-credential-collection.json", exportCredentialCollection(files));
      }}
    />
  );
}
