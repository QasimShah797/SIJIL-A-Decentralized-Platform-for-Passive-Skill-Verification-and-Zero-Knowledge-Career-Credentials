/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { MemorySsiKeyStore } from "@/lib/ssi/keystore";
import {
  createPassphraseVault,
  getUnlockedIdentity,
  lockIdentity,
  restorePassphraseVault,
  rotateVaultPassphrase,
  unlockPersistedIdentity,
} from "@/lib/ssi/session";
import { SSI_VAULT_FORMAT, generateWrappableLearnerKeyPair, identityFromWrappablePair } from "@/lib/ssi/vault";
import { signUtf8 } from "@/lib/ssi/keystore";

const ed25519Available = typeof crypto !== "undefined"
  && Boolean(crypto.subtle)
  && typeof crypto.subtle.generateKey === "function";

describe.skipIf(!ed25519Available)("passphrase vault", { timeout: 20000 }, () => {
  it("wraps, unlocks, rejects a wrong passphrase, and restores a backup", async () => {
    const store = new MemorySsiKeyStore();
    const created = await createPassphraseVault(store, "user-1", "correct-passphrase", null);
    expect(created.backup.format).toBe(SSI_VAULT_FORMAT);
    expect(JSON.stringify(created.backup)).not.toMatch(/BEGIN PRIVATE KEY/);
    expect(created.identity.privateKey.extractable).toBe(false);

    lockIdentity("user-1");
    expect(getUnlockedIdentity("user-1")).toBeNull();
    await expect(unlockPersistedIdentity(store, "user-1", "wrong-passphrase")).rejects.toThrow(/Incorrect passphrase/);
    const unlocked = await unlockPersistedIdentity(store, "user-1", "correct-passphrase");
    expect(unlocked.did).toBe(created.identity.did);
    const signature = await signUtf8(unlocked.privateKey, "hello");
    expect(signature).toMatch(/^[A-Za-z0-9_-]+$/);

    const restored = await restorePassphraseVault(
      new MemorySsiKeyStore(),
      created.backup,
      "correct-passphrase",
      "user-1",
    );
    expect(restored.did).toBe(created.identity.did);
  });

  it("rotates the passphrase without changing the DID", async () => {
    const store = new MemorySsiKeyStore();
    const created = await createPassphraseVault(store, "user-1", "old-passphrase-1", null);
    const did = created.identity.did;
    await rotateVaultPassphrase(store, "user-1", "old-passphrase-1", "new-passphrase-2");
    lockIdentity("user-1");
    await expect(unlockPersistedIdentity(store, "user-1", "old-passphrase-1")).rejects.toThrow(/Incorrect passphrase/);
    const unlocked = await unlockPersistedIdentity(store, "user-1", "new-passphrase-2");
    expect(unlocked.did).toBe(did);
  });

  it("refuses to wrap a non-extractable key", async () => {
    const pair = await crypto.subtle.generateKey(
      { name: "Ed25519" } as AlgorithmIdentifier,
      false,
      ["sign", "verify"],
    ) as CryptoKeyPair;
    await expect(identityFromWrappablePair("user-1", pair, "correct-passphrase")).rejects.toThrow(/wrappable/);
    void generateWrappableLearnerKeyPair;
  });

  it("refuses to restore a backup that would rotate a bound DID", async () => {
    const firstStore = new MemorySsiKeyStore();
    const secondStore = new MemorySsiKeyStore();
    const first = await createPassphraseVault(firstStore, "user-1", "correct-passphrase", null);
    const second = await createPassphraseVault(secondStore, "user-1", "other-passphrase", null);
    await expect(
      restorePassphraseVault(secondStore, first.backup, "correct-passphrase", "user-1", second.identity.did),
    ).rejects.toThrow(/rotate the DID/);
    await expect(
      restorePassphraseVault(secondStore, first.backup, "correct-passphrase", "user-1", first.identity.did),
    ).rejects.toThrow(/existing DID was not replaced/);
  });
});
