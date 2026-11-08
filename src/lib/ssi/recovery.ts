/**
 * Second-device restore for an existing passphrase vault.
 * The restored key is the key inside the recovery file. A new DID is never generated.
 * Decrypted key bytes stay in this browser.
 */
import { bindRequestBody, signOwnershipProof } from "./ownership";
import { restorePassphraseVault } from "./session";
import type { SsiKeyStore, StoredSsiIdentity } from "./keystore";
import { parseBackupJson, SSI_PASSPHRASE_MIN, SSI_PBKDF2_ITERATIONS } from "./vault";

export const RECOVERY_KDF = {
  name: "PBKDF2",
  hash: "SHA-256",
  iterations: SSI_PBKDF2_ITERATIONS,
  saltBytes: 16,
  encryption: "AES-GCM",
  minimumPasswordLength: SSI_PASSPHRASE_MIN,
} as const;

/**
 * Someone who obtains the recovery file can try passwords offline.
 * 310,000 PBKDF2-SHA-256 iterations slow each guess. They do not make a
 * short password safe, and SIJIL cannot reverse a forgotten password.
 */
export const RECOVERY_OFFLINE_GUESSING =
  "A person who has the recovery file can try passwords without contacting SIJIL. The file uses PBKDF2-SHA-256 with 310,000 iterations and a random 16-byte salt, then AES-GCM. That slows each guess. It does not stop guessing of a short password.";

export type RestoreResult = {
  did: string;
  status: "ready" | "interrupted";
};

function unavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /503|temporarily unavailable|Cannot reach|storage is not ready|migration is applied|verification is temporarily unavailable/i.test(message);
}

export async function restoreOnThisDevice(input: {
  store: SsiKeyStore;
  backupRaw: string;
  passphrase: string;
  userId: string;
  boundDid: string | null;
  prove: (record: StoredSsiIdentity) => Promise<void>;
}): Promise<RestoreResult> {
  const backup = parseBackupJson(input.backupRaw);
  const identity = await restorePassphraseVault(
    input.store,
    backup,
    input.passphrase,
    input.userId,
    input.boundDid,
  );
  try {
    await input.prove(identity);
  } catch (error) {
    if (unavailable(error)) return { did: identity.did, status: "interrupted" };
    throw error;
  }
  return { did: identity.did, status: "ready" };
}

export async function ownershipProofBody(record: StoredSsiIdentity, challenge: {
  challengeId: string;
  payload: string;
}): Promise<{ challengeId: string; did: string; signature: string }> {
  const signature = await signOwnershipProof(record, challenge.payload);
  const body = bindRequestBody({
    challengeId: challenge.challengeId,
    did: record.did,
    signature,
  });
  if ("privateKey" in body || JSON.stringify(body).includes("BEGIN PRIVATE KEY")) {
    throw new Error("Refusing to send private key material");
  }
  return body;
}

export function browserOnlyRecoveryLimit(): {
  canExport: false;
  canMigrateWithoutNewDid: false;
  message: string;
} {
  return {
    canExport: false,
    canMigrateWithoutNewDid: false,
    message: "This browser-only identity cannot be turned into a recovery file. The key cannot leave this browser, so SIJIL cannot move it to another device without creating a different identity. A new identity will not be created.",
  };
}
