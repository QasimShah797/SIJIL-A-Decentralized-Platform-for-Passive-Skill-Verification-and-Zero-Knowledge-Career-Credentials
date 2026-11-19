import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decryptSecret,
  deriveTokenEncryptionKey,
  encryptSecret,
  redactSecretsForLog,
} from "./token-crypto";

describe("token-crypto", () => {
  const secret = "sijil-local-test-encryption-key-32chars!!";

  it("derives a 32-byte key from a long passphrase", () => {
    const key = deriveTokenEncryptionKey(secret);
    assert.equal(key.length, 32);
  });

  it("round-trips encryption without exposing plaintext in the ciphertext envelope", () => {
    const plaintext = "1//refresh-token-sample-value";
    const encrypted = encryptSecret(plaintext, secret);
    assert.match(encrypted, /^v1\./);
    assert.equal(encrypted.includes(plaintext), false);
    assert.equal(decryptSecret(encrypted, secret), plaintext);
  });

  it("fails closed on tampered ciphertext", () => {
    const encrypted = encryptSecret("access-token-value", secret);
    const tampered = `${encrypted.slice(0, -2)}ab`;
    assert.throws(() => decryptSecret(tampered, secret));
  });

  it("redacts bearer and google-looking tokens from log strings", () => {
    const redacted = redactSecretsForLog("Bearer ya29.a0AfH6SMC_test and 1//0gxxxxxxxx");
    assert.equal(redacted.includes("ya29."), false);
    assert.equal(redacted.includes("1//0g"), false);
    assert.match(redacted, /redacted/i);
  });
});
