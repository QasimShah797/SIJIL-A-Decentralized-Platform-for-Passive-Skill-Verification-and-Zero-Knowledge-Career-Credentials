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
        ?? "This browser cannot store a learner SSI vault. SSI activation is disabled.",
    };
  }
  if (input.vaultLocked) {
    return {
      status: "locked",
      message: "This identity is passphrase-protected. Unlock to sign. SIJIL cannot recover a forgotten passphrase.",
    };
  }
  const localUsable = Boolean(input.local && isUsablePrivateKey(input.local.privateKey));
  const serverDid = input.serverDid && isDidKeyEd25519(input.serverDid) ? input.serverDid : null;

  if (input.local && !localUsable) {
    return {
      status: "key_unavailable",
      message: "An SSI identity exists on this device but the private key is not usable. A new DID will not be generated.",
    };
  }
  if (serverDid && !localUsable) {
    return {
      status: "key_unavailable",
      message: "This account has a registered DID, but this browser does not have the private key. Restore an encrypted backup or unlock this device. SIJIL cannot recover a forgotten passphrase.",
    };
  }
  if (localUsable && serverDid && input.local!.did !== serverDid) {
    return {
      status: "key_unavailable",
      message: "This device’s DID does not match the DID registered to the account. The local key was not replaced.",
    };
  }
  if (localUsable) {
    return {
      status: "active",
      message: serverDid
        ? "Learner-controlled Ed25519 identity is active on this device and registered to your account."
        : "Learner-controlled key is active on this device. Server registration is pending (apply the SSI migration).",
    };
  }
  return {
    status: "not_activated",
    message: "Generate an Ed25519 key on this device. The private key never leaves the browser.",
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
