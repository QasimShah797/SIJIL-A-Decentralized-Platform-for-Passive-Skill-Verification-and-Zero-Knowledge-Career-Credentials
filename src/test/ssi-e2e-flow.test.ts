/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { MemorySsiKeyStore, signUtf8 } from "@/lib/ssi/keystore";
import { createPassphraseVault, lockIdentity, unlockPersistedIdentity } from "@/lib/ssi/session";
import { buildPresentationSigningClaims, canonicalPresentationPayload } from "@/lib/ssi/presentation";
import { displayLearnerDid, holderDidFromUserId, isDidKeyEd25519 } from "@/lib/did";

const ed25519Available = typeof crypto !== "undefined"
  && Boolean(crypto.subtle)
  && typeof crypto.subtle.generateKey === "function";

describe.skipIf(!ed25519Available)("isolated SSI wallet flow", { timeout: 20000 }, () => {
  it("creates a vault, locks, unlocks, and signs presentation bytes", async () => {
    const store = new MemorySsiKeyStore();
    const created = await createPassphraseVault(store, "user-1", "correct-passphrase", null);
    expect(isDidKeyEd25519(created.identity.did)).toBe(true);
    lockIdentity("user-1");
    const unlocked = await unlockPersistedIdentity(store, "user-1", "correct-passphrase");
    const claims = buildPresentationSigningClaims({
      challengeId: "11111111-2222-4333-8444-555555555555",
      nonce: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      audience: "sijil-recruiter-verify",
      holderDid: unlocked.did,
      credentials: [{
        id: "6916c346-333b-4bd5-9f15-b75b1f54e50b",
        hash: "8ef4bb60f3e06e8d8c501e1bf64b5e9aa23194b617eece3575459523533e4a1a",
      }],
      issuedAt: "2026-10-16T19:00:00.000Z",
      expiresAt: "2026-10-16T19:15:00.000Z",
    });
    const payload = canonicalPresentationPayload(claims);
    const signature = await signUtf8(unlocked.privateKey, payload);
    expect(signature).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(displayLearnerDid(holderDidFromUserId("88226633-3715-44af-8202-ef6031e80164"))).toBeNull();
    expect(displayLearnerDid(unlocked.did)).toBe(unlocked.did);
  });
});
