import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  activateLocalIdentity,
  bindRequestBody,
  deriveSsiStatus,
  signOwnershipProof,
  type ServerSsiIdentity,
  type SsiSnapshot,
  type SsiUiStatus,
} from "@/lib/ssi/ownership";
import { indexedDbKeyStore, isUsablePrivateKey, publicView, type StoredSsiIdentity } from "@/lib/ssi/keystore";
import {
  createPassphraseVault,
  exportStoredBackup,
  getUnlockedIdentity,
  isVaultRecord,
  lockIdentity,
  rememberUnlocked,
  restorePassphraseVault,
  rotateVaultPassphrase,
  unlockPersistedIdentity,
} from "@/lib/ssi/session";
import { parseBackupJson, type EncryptedSsiBackup } from "@/lib/ssi/vault";
import { evaluateSsiBrowserSupport, type SsiSupportResult } from "@/lib/ssi/support";
import {
  bindSsiIdentityApi,
  createSsiChallengeApi,
  getSsiIdentityApi,
} from "@/services/api/ssi.api";

const unsupportedSupport: SsiSupportResult = {
  webCrypto: false,
  ed25519: false,
  indexedDb: false,
  nonExtractablePersist: false,
  ok: false,
  reasons: ["Checking browser support…"],
};

async function bindDid(record: StoredSsiIdentity): Promise<void> {
  const challenge = await createSsiChallengeApi();
  const signature = await signOwnershipProof(record, challenge.payload);
  const body = bindRequestBody({
    challengeId: challenge.challengeId,
    did: record.did,
    signature,
  });
  if ("privateKey" in body || "jwk" in body) {
    throw new Error("Refusing to send private key material");
  }
  await bindSsiIdentityApi(body);
}

export function useSsiIdentity() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<SsiSnapshot>({
    status: "not_activated",
    local: null,
    server: { did: null, fingerprint: null, boundAt: null, tableReady: false },
    support: unsupportedSupport,
    message: "Checking SSI support…",
  });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoverable, setRecoverable] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setSnapshot({
        status: "not_activated",
        local: null,
        server: { did: null, fingerprint: null, boundAt: null, tableReady: false },
        support: unsupportedSupport,
        message: "Sign in as a learner to activate an SSI identity.",
      });
      setRecoverable(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const support = await evaluateSsiBrowserSupport();
      const persisted = support.ok && indexedDbKeyStore.loadPersisted
        ? await indexedDbKeyStore.loadPersisted(user.id)
        : await indexedDbKeyStore.load(user.id);
      const vault = isVaultRecord(persisted);
      setRecoverable(vault);
      const unlocked = getUnlockedIdentity(user.id);
      let local: StoredSsiIdentity | null = unlocked;
      if (!local && persisted && !vault && isUsablePrivateKey(persisted.privateKey)) {
        local = rememberUnlocked(persisted);
      }
      const api = await getSsiIdentityApi();
      const server: ServerSsiIdentity = {
        did: api?.did ?? null,
        fingerprint: api?.fingerprint ?? null,
        boundAt: api?.boundAt ?? null,
        tableReady: api?.tableReady ?? false,
      };
      const derived = deriveSsiStatus({
        support,
        local,
        serverDid: server.did,
        vaultLocked: vault && !local,
      });
      setSnapshot({
        status: derived.status,
        local: local ? publicView(local) : (vault ? {
          userId: persisted.userId,
          did: persisted.did,
          fingerprint: persisted.fingerprint,
          createdAt: persisted.createdAt,
        } : null),
        server,
        support,
        message: derived.message,
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load SSI identity.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activate = useCallback(async (passphrase?: string): Promise<SsiUiStatus> => {
    if (!user?.id) throw new Error("Sign in required");
    setWorking(true);
    setError(null);
    try {
      const support = await evaluateSsiBrowserSupport();
      if (!support.ok) {
        throw new Error(support.reasons[0] ?? "Browser cannot store a learner SSI identity");
      }
      const api = await getSsiIdentityApi();
      let record: StoredSsiIdentity;
      if (passphrase) {
        const created = await createPassphraseVault(indexedDbKeyStore, user.id, passphrase, api?.did ?? null);
        record = created.identity;
      } else {
        if (!support.nonExtractablePersist) {
          throw new Error("This browser cannot persist a non-extractable key. Create a passphrase-protected identity instead.");
        }
        const existing = await indexedDbKeyStore.load(user.id);
        record = await activateLocalIdentity(user.id, indexedDbKeyStore, existing, api?.did ?? null);
        rememberUnlocked(record);
      }
      try {
        await bindDid(record);
      } catch (bindError) {
        const message = bindError instanceof Error ? bindError.message : "Could not register DID";
        if (/Apply supabase\/migrations|503/.test(message)) {
          const derived = deriveSsiStatus({ support, local: record, serverDid: null });
          setSnapshot({
            status: derived.status,
            local: publicView(record),
            server: { did: null, fingerprint: null, boundAt: null, tableReady: false },
            support,
            message: `${derived.message} Server table is not applied yet.`,
          });
          return derived.status;
        }
        throw bindError;
      }
      await refresh();
      return "active";
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Activation failed";
      setError(message);
      throw nextError;
    } finally {
      setWorking(false);
    }
  }, [user?.id, refresh]);

  const unlock = useCallback(async (passphrase: string) => {
    if (!user?.id) throw new Error("Sign in required");
    await unlockPersistedIdentity(indexedDbKeyStore, user.id, passphrase);
    await refresh();
  }, [user?.id, refresh]);

  const lock = useCallback(() => {
    if (!user?.id) return;
    lockIdentity(user.id);
    void refresh();
  }, [user?.id, refresh]);

  const exportBackup = useCallback(async (): Promise<EncryptedSsiBackup> => {
    if (!user?.id) throw new Error("Sign in required");
    const persisted = indexedDbKeyStore.loadPersisted
      ? await indexedDbKeyStore.loadPersisted(user.id)
      : null;
    if (!isVaultRecord(persisted)) {
      throw new Error("This identity uses a non-extractable key and cannot be exported. Encrypted backup is only available for passphrase-protected identities.");
    }
    return exportStoredBackup(persisted);
  }, [user?.id]);

  const restoreBackup = useCallback(async (raw: string, passphrase: string) => {
    if (!user?.id) throw new Error("Sign in required");
    const backup = parseBackupJson(raw);
    const api = await getSsiIdentityApi();
    const identity = await restorePassphraseVault(
      indexedDbKeyStore,
      backup,
      passphrase,
      user.id,
      api?.did ?? null,
    );
    if (!api?.did) {
      await bindDid(identity);
    }
    await refresh();
  }, [user?.id, refresh]);

  const changePassphrase = useCallback(async (currentPassphrase: string, nextPassphrase: string) => {
    if (!user?.id) throw new Error("Sign in required");
    await rotateVaultPassphrase(indexedDbKeyStore, user.id, currentPassphrase, nextPassphrase);
    await refresh();
  }, [user?.id, refresh]);

  const signingIdentity = user?.id ? getUnlockedIdentity(user.id) : null;

  return {
    snapshot,
    loading,
    working,
    error,
    recoverable,
    signingIdentity,
    refresh,
    activate,
    unlock,
    lock,
    exportBackup,
    restoreBackup,
    changePassphrase,
  };
}
