import { canonicalizeJson } from "@/lib/ssi/canonicalize";
import {
  credentialId,
  parsePortableCredential,
  serializePortableCredential,
  type PortableCredentialFile,
} from "./portable";

export const CREDENTIAL_COLLECTION_FORMAT = "SIJIL-CREDENTIAL-COLLECTION-v1";

export type LocalCredentialRecord = {
  key: string;
  id: string;
  userId: string;
  canonicalDocument: string;
  file: PortableCredentialFile;
  savedAt: string;
};

export type ImportOutcome = "saved" | "duplicate" | "conflict";

function sameBytes(left: LocalCredentialRecord, file: PortableCredentialFile, canonical: string): boolean {
  return left.canonicalDocument === canonical
    && left.file.credentialHash === file.credentialHash
    && left.file.proof.proofValue === file.proof.proofValue;
}

export function importPortableCredential(
  existing: LocalCredentialRecord[],
  userId: string,
  file: PortableCredentialFile,
  savedAt = new Date().toISOString(),
): { records: LocalCredentialRecord[]; outcome: ImportOutcome } {
  const id = credentialId(file);
  if (!id) throw new Error("This credential file has no identifier");
  const canonical = canonicalizeJson(file.document);
  const current = existing.find((record) => record.userId === userId && record.id === id);
  if (current) {
    return {
      records: existing,
      outcome: sameBytes(current, file, canonical) ? "duplicate" : "conflict",
    };
  }
  return {
    outcome: "saved",
    records: [
      ...existing,
      {
        key: `${userId}:${id}`,
        id,
        userId,
        canonicalDocument: canonical,
        file,
        savedAt,
      },
    ],
  };
}

export function exportCredentialCollection(files: PortableCredentialFile[]): string {
  const credentials = files.map((file) => JSON.parse(serializePortableCredential(file)) as PortableCredentialFile);
  return JSON.stringify({ format: CREDENTIAL_COLLECTION_FORMAT, credentials }, null, 2);
}

export function importCredentialPayload(
  existing: LocalCredentialRecord[],
  userId: string,
  raw: string,
): { records: LocalCredentialRecord[]; saved: number; duplicates: number; conflicts: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("This file is not valid JSON");
  }
  const files = collectionFiles(parsed, raw);
  let records = existing;
  let saved = 0;
  let duplicates = 0;
  let conflicts = 0;
  for (const file of files) {
    const next = importPortableCredential(records, userId, file);
    records = next.records;
    if (next.outcome === "saved") saved += 1;
    if (next.outcome === "duplicate") duplicates += 1;
    if (next.outcome === "conflict") conflicts += 1;
  }
  return { records, saved, duplicates, conflicts };
}

function collectionFiles(parsed: unknown, raw: string): PortableCredentialFile[] {
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && (parsed as { format?: string }).format === CREDENTIAL_COLLECTION_FORMAT) {
    const credentials = (parsed as { credentials?: unknown }).credentials;
    if (!Array.isArray(credentials) || credentials.length === 0) {
      throw new Error("This credential collection is empty");
    }
    return credentials.map((item) => parsePortableCredential(JSON.stringify(item)));
  }
  return [parsePortableCredential(raw)];
}

export function importPortableJson(
  existing: LocalCredentialRecord[],
  userId: string,
  raw: string,
): { records: LocalCredentialRecord[]; outcome: ImportOutcome; file: PortableCredentialFile } {
  const file = parsePortableCredential(raw);
  const imported = importPortableCredential(existing, userId, file);
  return { ...imported, file };
}

export function listLocalCredentials(existing: LocalCredentialRecord[], userId: string): LocalCredentialRecord[] {
  return existing.filter((record) => record.userId === userId);
}

const DB_NAME = "sijil-credential-wallet-v1";
const STORE = "credentials";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the credential wallet"));
  });
}

async function readAll(): Promise<LocalCredentialRecord[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result ?? []) as LocalCredentialRecord[]);
      request.onerror = () => reject(request.error ?? new Error("Could not read saved credentials"));
    });
  } finally {
    db.close();
  }
}

async function writeAll(records: LocalCredentialRecord[]): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.clear();
      for (const record of records) store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not save the credential"));
    });
  } finally {
    db.close();
  }
}

export async function loadLocalCredentials(userId: string): Promise<LocalCredentialRecord[]> {
  return listLocalCredentials(await readAll(), userId);
}

export async function saveCredentialPayload(
  userId: string,
  raw: string,
): Promise<{ saved: number; duplicates: number; conflicts: number }> {
  const existing = await readAll();
  const imported = importCredentialPayload(existing, userId, raw);
  if (imported.saved > 0) await writeAll(imported.records);
  return { saved: imported.saved, duplicates: imported.duplicates, conflicts: imported.conflicts };
}

export async function saveImportedCredential(
  userId: string,
  raw: string,
): Promise<{ outcome: ImportOutcome; file: PortableCredentialFile }> {
  const existing = await readAll();
  const imported = importPortableJson(existing, userId, raw);
  if (imported.outcome === "saved") await writeAll(imported.records);
  return { outcome: imported.outcome, file: imported.file };
}
