import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { signSha256Hash, verifySha256Hash } from "./ed25519";

const hashHex = "ab".repeat(32);

function keypair(): { privatePem: string; publicPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function nonCanonicalLastChar(canonical: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const last = canonical[canonical.length - 1] ?? "A";
  const idx = alphabet.indexOf(last);
  for (let offset = 1; offset < alphabet.length; offset += 1) {
    const candidate = canonical.slice(0, -1) + alphabet[(idx + offset) % alphabet.length];
    const decoded = Buffer.from(candidate, "base64url");
    if (decoded.byteLength !== 64) continue;
    if (decoded.toString("base64url") === candidate) continue;
    return candidate;
  }
  throw new Error("could not construct a non-canonical last character");
}

describe("verifySha256Hash canonical proofValue", () => {
  it("accepts a canonical 64-byte signature", () => {
    const { privatePem, publicPem } = keypair();
    const proofValue = signSha256Hash(hashHex, privatePem);
    assert.equal(verifySha256Hash(hashHex, proofValue, publicPem), true);
  });

  it("rejects a non-canonical last character", () => {
    const { privatePem, publicPem } = keypair();
    const proofValue = signSha256Hash(hashHex, privatePem);
    const mutated = nonCanonicalLastChar(proofValue);
    assert.notEqual(mutated, proofValue);
    assert.equal(verifySha256Hash(hashHex, mutated, publicPem), false);
  });

  it("rejects the wrong decoded length", () => {
    const { publicPem } = keypair();
    const tooShort = Buffer.alloc(32).toString("base64url");
    const tooLong = Buffer.alloc(65).toString("base64url");
    assert.equal(verifySha256Hash(hashHex, tooShort, publicPem), false);
    assert.equal(verifySha256Hash(hashHex, tooLong, publicPem), false);
  });

  it("rejects an empty string", () => {
    const { publicPem } = keypair();
    assert.equal(verifySha256Hash(hashHex, "", publicPem), false);
  });

  it("rejects invalid characters", () => {
    const { privatePem, publicPem } = keypair();
    const proofValue = signSha256Hash(hashHex, privatePem);
    assert.equal(verifySha256Hash(hashHex, `${proofValue}+/`, publicPem), false);
    assert.equal(verifySha256Hash(hashHex, "not a signature!", publicPem), false);
  });

  it("rejects one bit flipped in a middle byte", () => {
    const { privatePem, publicPem } = keypair();
    const proofValue = signSha256Hash(hashHex, privatePem);
    const buf = Buffer.from(proofValue, "base64url");
    buf[32] ^= 0x01;
    const flipped = buf.toString("base64url");
    assert.equal(verifySha256Hash(hashHex, flipped, publicPem), false);
  });
});
