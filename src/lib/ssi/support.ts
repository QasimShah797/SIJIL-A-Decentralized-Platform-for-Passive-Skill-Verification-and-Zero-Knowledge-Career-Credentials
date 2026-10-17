export type SsiSupportResult = {
  webCrypto: boolean;
  ed25519: boolean;
  indexedDb: boolean;
  nonExtractablePersist: boolean;
  ok: boolean;
  reasons: string[];
};

const PROBE_DB = "sijil-ssi-probe-v1";
const PROBE_STORE = "probe";

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined" && typeof indexedDB.open === "function";
}

async function probeEd25519(): Promise<CryptoKeyPair | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  try {
    return await crypto.subtle.generateKey(
      { name: "Ed25519" } as AlgorithmIdentifier,
      false,
      ["sign", "verify"],
    ) as CryptoKeyPair;
  } catch {
    return null;
  }
}

function openProbeDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PROBE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROBE_STORE)) db.createObjectStore(PROBE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB probe open failed"));
  });
}

async function probeNonExtractablePersist(pair: CryptoKeyPair): Promise<boolean> {
  if (!hasIndexedDb()) return false;
  if (pair.privateKey.extractable) return false;
  let db: IDBDatabase | null = null;
  try {
    db = await openProbeDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(PROBE_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB probe write failed"));
      tx.objectStore(PROBE_STORE).put(pair.privateKey, "k");
    });
    const restored = await new Promise<unknown>((resolve, reject) => {
      const tx = db!.transaction(PROBE_STORE, "readonly");
      const req = tx.objectStore(PROBE_STORE).get("k");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB probe read failed"));
    });
    if (!(restored instanceof CryptoKey) || restored.extractable || restored.type !== "private") {
      return false;
    }
    const signature = await crypto.subtle.sign(
      { name: "Ed25519" } as AlgorithmIdentifier,
      restored,
      new TextEncoder().encode("sijil-ssi-probe"),
    );
    return signature.byteLength === 64;
  } catch {
    return false;
  } finally {
    db?.close();
    try {
      indexedDB.deleteDatabase(PROBE_DB);
    } catch {
      // ignore
    }
  }
}

export async function evaluateSsiBrowserSupport(): Promise<SsiSupportResult> {
  const reasons: string[] = [];
  const webCrypto = typeof crypto !== "undefined" && Boolean(crypto.subtle);
  if (!webCrypto) reasons.push("Web Crypto is not available in this browser.");

  const pair = webCrypto ? await probeEd25519() : null;
  const ed25519 = Boolean(pair);
  if (!ed25519) reasons.push("Ed25519 in Web Crypto is not available (need a current Chromium, Firefox, or Safari).");

  const indexedDb = hasIndexedDb();
  if (!indexedDb) reasons.push("IndexedDB is not available (private mode can block it).");

  const nonExtractablePersist = pair && indexedDb ? await probeNonExtractablePersist(pair) : false;

  return {
    webCrypto,
    ed25519,
    indexedDb,
    nonExtractablePersist,
    ok: webCrypto && ed25519 && indexedDb,
    reasons,
  };
}
