import { isDidKeyEd25519 } from "./did-key";
import {
  generateLearnerKeyPair,
  identityFromKeyPair,
  isUsablePrivateKey,
  signUtf8,
  type SsiIdentityPublicView,
  type SsiKeyStore,
  type StoredSsiIdentity,
} from "./keystore";
import type { SsiSupportResult } from "./support";

export type SsiUiStatus = "unsupported" | "not_activated" | "active" | "locked" | "key_unavailable";

export type ServerSsiIdentity = {
  did: string | null;
  fingerprint: string | null;
  boundAt: string | null;
  tableReady: boolean;
};

export type SsiSnapshot = {
  status: SsiUiStatus;
  local: SsiIdentityPublicView | null;
  server: ServerSsiIdentity;
  support: SsiSupportResult;
  message: string;
};

export function ownershipSignPayload(challengePayload: string, did: string): string {
  return `${challengePayload}\ndid=${did}`;
}

export function bindRequestBody(input: {
  challengeId: string;
  did: string;
  signature: string;
}): { challengeId: string; did: string; signature: string } {
  return {
    challengeId: input.challengeId,
    did: input.did,
    signature: input.signature,
  };
}

export function deriveSsiStatus(input: {
  support: SsiSupportResult;
  local: StoredSsiIdentity | null;
  serverDid: string | null;
  vaultLocked?: boolean;
}): { status: SsiUiStatus; message: string } {
  if (!input.support.ok) {
    return {
      status: "unsupported",
      message: input.support.reasons[0]
        ?? "This browser cannot store a learning identity. Setup is unavailable.",
    };
  }
  if (input.vaultLocked) {
    return {
      status: "locked",
      message: "Your learning identity is locked. Enter your recovery password to continue. SIJIL cannot reset that password.",
    };
  }
  const localUsable = Boolean(input.local && isUsablePrivateKey(input.local.privateKey));
  const serverDid = input.serverDid && isDidKeyEd25519(input.serverDid) ? input.serverDid : null;

  if (input.local && !localUsable) {
    return {
      status: "key_unavailable",
      message: "A learning identity exists on this device, but its key cannot be used. A replacement will not be created.",
    };
  }
  if (serverDid && !localUsable) {
    return {
      status: "key_unavailable",
      message: "Your account already has a learning identity, and this browser does not have its key. Restore a recovery file, or unlock it on the device that created it. A browser-only identity cannot be restored.",
    };
  }
  if (localUsable && serverDid && input.local!.did !== serverDid) {
    return {
      status: "key_unavailable",
      message: "This browser’s identity does not match the one on your account. The existing identity was not replaced.",
    };
  }
  if (localUsable) {
    return {
      status: "active",
      message: serverDid
        ? "Your learning identity is ready on this device."
        : "This device has your learning identity. Finish connecting it to your account. A new identity will not be created.",
    };
  }
  return {
    status: "not_activated",
    message: "Secure your learning identity on this device. The private key never leaves this browser.",
  };
}

export async function activateLocalIdentity(
  userId: string,
  store: SsiKeyStore,
  existing: StoredSsiIdentity | null,
  serverDid: string | null,
): Promise<StoredSsiIdentity> {
  if (existing) {
    if (!isUsablePrivateKey(existing.privateKey)) {
      throw new Error("Existing key is unusable; refusing to generate a replacement DID");
    }
    return existing;
  }
  if (serverDid && isDidKeyEd25519(serverDid)) {
    throw new Error("A DID is already registered for this account on another device");
  }
  const pair = await generateLearnerKeyPair();
  const record = await identityFromKeyPair(userId, pair);
  await store.save(record);
  return record;
}

export async function signOwnershipProof(
  record: StoredSsiIdentity,
  challengePayload: string,
): Promise<string> {
  if (!isUsablePrivateKey(record.privateKey)) {
    throw new Error("Private key is not usable");
  }
  return signUtf8(record.privateKey, ownershipSignPayload(challengePayload, record.did));
}
