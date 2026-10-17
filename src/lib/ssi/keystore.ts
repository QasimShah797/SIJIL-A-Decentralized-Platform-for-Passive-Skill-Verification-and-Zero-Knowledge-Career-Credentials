import { encodeDidKeyFromRawPublicKey, publicKeyFingerprint } from "./did-key";

export const SSI_IDB_NAME = "sijil-ssi-v1";
export const SSI_IDB_STORE = "learner-keys";

export type StoredSsiIdentity = {
  userId: string;
  did: string;
  fingerprint: string;
  createdAt: string;
  privateKey: CryptoKey;
};

export type SsiIdentityPublicView = {
  userId: string;
  did: string;
  fingerprint: string;
  createdAt: string;
};

export type PersistedSsiRecord =
  | StoredSsiIdentity
  | {
      kind: "vault";
      userId: string;
      did: string;
      fingerprint: string;
      createdAt: string;
      wrap: import("./vault").VaultWrap;
    };

export interface SsiKeyStore {
  load(userId: string): Promise<StoredSsiIdentity | null>;
  save(record: StoredSsiIdentity): Promise<void>;
  loadPersisted?(userId: string): Promise<PersistedSsiRecord | null>;
  saveVault?(backup: import("./vault").EncryptedSsiBackup): Promise<void>;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SSI_IDB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SSI_IDB_STORE)) {
        db.createObjectStore(SSI_IDB_STORE, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open SSI IndexedDB"));
  });
}

function isVaultRow(row: unknown): row is Extract<PersistedSsiRecord, { kind: "vault" }> {
  return Boolean(row && typeof row === "object" && (row as { kind?: string }).kind === "vault");
}

async function idbGet(userId: string): Promise<unknown> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(SSI_IDB_STORE, "readonly");
      const req = tx.objectStore(SSI_IDB_STORE).get(userId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Could not read SSI key"));
    });
  } finally {
    db.close();
  }
}

async function idbPut(record: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SSI_IDB_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not persist SSI key"));
      tx.objectStore(SSI_IDB_STORE).put(record);
    });
  } finally {
    db.close();
  }
}

export const indexedDbKeyStore: SsiKeyStore = {
  async load(userId: string): Promise<StoredSsiIdentity | null> {
    const row = await idbGet(userId);
    if (!row || isVaultRow(row)) return null;
    const record = row as StoredSsiIdentity;
    if (!(record.privateKey instanceof CryptoKey) || record.privateKey.type !== "private") {
      return { ...record, privateKey: record.privateKey };
    }
    return record;
  },
  async save(record: StoredSsiIdentity): Promise<void> {
    if (record.privateKey.extractable) {
      throw new Error("Refusing to persist an extractable private key");
    }
    await idbPut(record);
  },
  async loadPersisted(userId: string): Promise<PersistedSsiRecord | null> {
    const row = await idbGet(userId);
    if (!row) return null;
    if (isVaultRow(row)) return row;
    return row as StoredSsiIdentity;
  },
  async saveVault(backup): Promise<void> {
    if (JSON.stringify(backup).match(/BEGIN PRIVATE KEY|pkcs8|privateKey/i)
      && !backup.wrap?.ciphertext) {
      throw new Error("Refusing to persist plaintext key material");
    }
    await idbPut({
      kind: "vault",
      userId: backup.userId,
      did: backup.did,
      fingerprint: backup.fingerprint,
      createdAt: backup.createdAt,
      wrap: backup.wrap,
    });
  },
};

export class MemorySsiKeyStore implements SsiKeyStore {
  private readonly rows = new Map<string, PersistedSsiRecord>();

  async load(userId: string): Promise<StoredSsiIdentity | null> {
    const row = this.rows.get(userId);
    if (!row || isVaultRow(row)) return null;
    return row;
  }

  async save(record: StoredSsiIdentity): Promise<void> {
    if (record.privateKey.extractable) {
      throw new Error("Refusing to persist an extractable private key");
    }
    this.rows.set(record.userId, record);
  }

  async loadPersisted(userId: string): Promise<PersistedSsiRecord | null> {
    return this.rows.get(userId) ?? null;
  }

  async saveVault(backup: import("./vault").EncryptedSsiBackup): Promise<void> {
    this.rows.set(backup.userId, {
      kind: "vault",
      userId: backup.userId,
      did: backup.did,
      fingerprint: backup.fingerprint,
      createdAt: backup.createdAt,
      wrap: backup.wrap,
    });
  }
}

export async function generateLearnerKeyPair(): Promise<CryptoKeyPair> {
  const pair = await crypto.subtle.generateKey(
    { name: "Ed25519" } as AlgorithmIdentifier,
    false,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  if (pair.privateKey.extractable) {
    throw new Error("Browser produced an extractable private key; aborting");
  }
  return pair;
}

export async function identityFromKeyPair(
  userId: string,
  pair: CryptoKeyPair,
  now = () => new Date().toISOString(),
): Promise<StoredSsiIdentity> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const did = encodeDidKeyFromRawPublicKey(raw);
  const fingerprint = await publicKeyFingerprint(raw);
  return {
    userId,
    did,
    fingerprint,
    createdAt: now(),
    privateKey: pair.privateKey,
  };
}

export function publicView(record: StoredSsiIdentity): SsiIdentityPublicView {
  return {
    userId: record.userId,
    did: record.did,
    fingerprint: record.fingerprint,
    createdAt: record.createdAt,
  };
}

export async function signUtf8(privateKey: CryptoKey, payload: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" } as AlgorithmIdentifier,
    privateKey,
    new TextEncoder().encode(payload),
  );
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function isUsablePrivateKey(key: unknown): key is CryptoKey {
  return key instanceof CryptoKey && key.type === "private" && !key.extractable;
}
