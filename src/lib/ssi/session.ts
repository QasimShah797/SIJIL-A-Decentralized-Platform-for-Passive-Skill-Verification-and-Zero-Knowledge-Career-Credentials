import { isDidKeyEd25519 } from "./did-key";
import {
  isUsablePrivateKey,
  type PersistedSsiRecord,
  type SsiKeyStore,
  type StoredSsiIdentity,
} from "./keystore";
import {
  SSI_VAULT_FORMAT,
  generateWrappableLearnerKeyPair,
  identityFromWrappablePair,
  rewrapVault,
  unlockBackup,
  type EncryptedSsiBackup,
} from "./vault";

const unlocked = new Map<string, StoredSsiIdentity>();

export function getUnlockedIdentity(userId: string): StoredSsiIdentity | null {
  const record = unlocked.get(userId) ?? null;
  if (!record || !isUsablePrivateKey(record.privateKey)) {
    unlocked.delete(userId);
    return null;
  }
  return record;
}

export function lockIdentity(userId: string): void {
  unlocked.delete(userId);
}

export function rememberUnlocked(record: StoredSsiIdentity): StoredSsiIdentity {
  if (!isUsablePrivateKey(record.privateKey)) {
    throw new Error("Refusing to cache an unusable private key");
  }
  unlocked.set(record.userId, record);
  return record;
}

export function isVaultRecord(row: PersistedSsiRecord | null): row is Extract<PersistedSsiRecord, { kind: "vault" }> {
  return Boolean(row && "kind" in row && row.kind === "vault");
}

export async function unlockPersistedIdentity(
  store: SsiKeyStore,
  userId: string,
  passphrase: string,
): Promise<StoredSsiIdentity> {
  const persisted = store.loadPersisted ? await store.loadPersisted(userId) : await store.load(userId);
  if (!persisted) throw new Error("No SSI identity is stored in this browser");
  if (!isVaultRecord(persisted)) {
    if (!isUsablePrivateKey(persisted.privateKey)) {
      throw new Error("Stored key is not usable");
    }
    return rememberUnlocked(persisted);
  }
  const identity = await unlockBackup({
    format: SSI_VAULT_FORMAT,
    userId: persisted.userId,
    did: persisted.did,
    fingerprint: persisted.fingerprint,
    createdAt: persisted.createdAt,
    wrap: persisted.wrap,
  }, passphrase);
  return rememberUnlocked(identity);
}

export async function createPassphraseVault(
  store: SsiKeyStore,
  userId: string,
  passphrase: string,
  serverDid: string | null,
): Promise<{ identity: StoredSsiIdentity; backup: EncryptedSsiBackup }> {
  if (serverDid && isDidKeyEd25519(serverDid)) {
    throw new Error("A DID is already registered for this account on another device");
  }
  const existing = store.loadPersisted ? await store.loadPersisted(userId) : await store.load(userId);
  if (existing) {
    throw new Error("An SSI identity already exists on this device");
  }
  const pair = await generateWrappableLearnerKeyPair();
  const created = await identityFromWrappablePair(userId, pair, passphrase);
  if (!store.saveVault) throw new Error("This key store cannot persist a passphrase vault");
  await store.saveVault(created.backup);
  rememberUnlocked(created.identity);
  return created;
}

export async function restorePassphraseVault(
  store: SsiKeyStore,
  backup: EncryptedSsiBackup,
  passphrase: string,
  expectedUserId: string,
  boundDid: string | null = null,
): Promise<StoredSsiIdentity> {
  if (backup.userId !== expectedUserId) {
    throw new Error("This backup belongs to a different SIJIL account");
  }
  if (boundDid && isDidKeyEd25519(boundDid) && boundDid !== backup.did) {
    throw new Error(
      "This backup DID does not match the identity already bound to this account. Restoring it would rotate the DID and invalidate credentials.",
    );
  }
  const existing = store.loadPersisted ? await store.loadPersisted(expectedUserId) : await store.load(expectedUserId);
  if (existing && existing.did !== backup.did) {
    throw new Error("This device already has a different SSI identity. The existing DID was not replaced.");
  }
  const identity = await unlockBackup(backup, passphrase);
  if (!store.saveVault) throw new Error("This key store cannot persist a passphrase vault");
  await store.saveVault(backup);
  return rememberUnlocked(identity);
}

export async function rotateVaultPassphrase(
  store: SsiKeyStore,
  userId: string,
  currentPassphrase: string,
  nextPassphrase: string,
): Promise<EncryptedSsiBackup> {
  const persisted = store.loadPersisted ? await store.loadPersisted(userId) : null;
  if (!isVaultRecord(persisted)) {
    throw new Error("This identity is not passphrase-wrapped, so the passphrase cannot be changed");
  }
  const nextWrap = await rewrapVault(persisted.wrap, currentPassphrase, nextPassphrase);
  const backup: EncryptedSsiBackup = {
    format: SSI_VAULT_FORMAT,
    userId: persisted.userId,
    did: persisted.did,
    fingerprint: persisted.fingerprint,
    createdAt: persisted.createdAt,
    wrap: nextWrap,
  };
  if (!store.saveVault) throw new Error("This key store cannot persist a passphrase vault");
  await store.saveVault(backup);
  const identity = await unlockBackup(backup, nextPassphrase);
  rememberUnlocked(identity);
  return backup;
}

export function exportStoredBackup(row: Extract<PersistedSsiRecord, { kind: "vault" }>): EncryptedSsiBackup {
  return {
    format: SSI_VAULT_FORMAT,
    userId: row.userId,
    did: row.did,
    fingerprint: row.fingerprint,
    createdAt: row.createdAt,
    wrap: row.wrap,
  };
}
