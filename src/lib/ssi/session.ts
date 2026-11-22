import { isDidKeyEd25519 } from "./did-key";
import {
  isUsablePrivateKey,
  signUtf8,
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
const approvedDownloads = new WeakMap<EncryptedSsiBackup, StoredSsiIdentity>();

function approveRecoveryDownload(backup: EncryptedSsiBackup, active: StoredSsiIdentity): void {
  Object.freeze(backup.wrap.kdf);
  Object.freeze(backup.wrap);
  Object.freeze(backup);
  approvedDownloads.set(backup, active);
}

export function assertRecoveryDownloadAuthorized(backup: EncryptedSsiBackup): void {
  const active = getUnlockedIdentity(backup.userId);
  if (!active || approvedDownloads.get(backup) !== active || active.did !== backup.did) {
    throw new Error("Unlock your identity and verify your recovery password before downloading.");
  }
}

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
  approveRecoveryDownload(created.backup, created.identity);
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
): Promise<void> {
  const active = getUnlockedIdentity(userId);
  if (!active) throw new Error("Unlock your identity before changing its recovery password.");
  const persisted = store.loadPersisted ? await store.loadPersisted(userId) : null;
  if (!isVaultRecord(persisted) || persisted.userId !== userId || persisted.did !== active.did) {
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
  if (getUnlockedIdentity(userId) !== active) throw new Error("Unlock your identity before changing its recovery password.");
  await store.saveVault(backup);
}

export async function exportStoredBackup(
  store: SsiKeyStore,
  userId: string,
  recoveryPassword: string,
): Promise<EncryptedSsiBackup> {
  const active = getUnlockedIdentity(userId);
  const lockedError = "Unlock your identity before downloading a recovery file.";
  if (!active) throw new Error(lockedError);
  const row = await store.loadPersisted?.(userId);
  if (!isVaultRecord(row)) {
    throw new Error("Encrypted recovery files are only available for password-protected identities.");
  }
  if (row.userId !== userId || row.did !== active.did || row.fingerprint !== active.fingerprint) {
    throw new Error("The recovery file does not match your unlocked identity.");
  }
  if (getUnlockedIdentity(userId) !== active) throw new Error(lockedError);
  const { alg, iv, ciphertext, kdf } = row.wrap;
  const backup: EncryptedSsiBackup = {
    format: SSI_VAULT_FORMAT,
    userId: row.userId,
    did: row.did,
    fingerprint: row.fingerprint,
    createdAt: row.createdAt,
    wrap: { alg, iv, ciphertext, kdf: { name: kdf.name, hash: kdf.hash, iterations: kdf.iterations, salt: kdf.salt } },
  };
  const verified = await unlockBackup(backup, recoveryPassword);
  // Compare deterministic Ed25519 signatures to detect a mismatched stored key.
  const purpose = "SIJIL recovery export key check v1";
  const [storedSignature, activeSignature] = await Promise.all([
    signUtf8(verified.privateKey, purpose),
    signUtf8(active.privateKey, purpose),
  ]);
  if (getUnlockedIdentity(userId) !== active) throw new Error(lockedError);
  if (storedSignature !== activeSignature) throw new Error("The recovery file does not match your unlocked identity.");
  approveRecoveryDownload(backup, active);
  return backup;
}
