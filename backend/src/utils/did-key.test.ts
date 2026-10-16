import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  canonicalSsiBindingFromDid,
  encodeDidKeyFromRawPublicKey,
  fingerprintFromRawPublicKey,
  isDidKeyEd25519,
  isLegacyPlaceholderDid,
  resolveDidKey,
} from "./did-key";

function rawEd25519PublicKey() {
  const { publicKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  return new Uint8Array(der.subarray(der.byteLength - 32));
}

describe("did:key Ed25519", () => {
  it("round-trips a raw public key", () => {
    const raw = rawEd25519PublicKey();
    const did = encodeDidKeyFromRawPublicKey(raw);
    assert.match(did, /^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
    const resolved = resolveDidKey(did);
    assert.equal(resolved.did, did);
    assert.equal(Buffer.from(resolved.publicKey).equals(Buffer.from(raw)), true);
    assert.equal(resolved.verificationMethod.startsWith(`${did}#z`), true);
    assert.equal(isDidKeyEd25519(did), true);
  });

  it("encodes the RFC 8032 test-1 public key as a real did:key", () => {
    const raw = Buffer.from(
      "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
      "hex",
    );
    const did = encodeDidKeyFromRawPublicKey(raw);
    const resolved = resolveDidKey(did);
    assert.equal(Buffer.from(resolved.publicKey).toString("hex"), raw.toString("hex"));
    assert.equal(did.startsWith("did:key:z6Mk"), true);
    assert.equal(isLegacyPlaceholderDid(did), false);
    assert.match(did, /^did:key:z[1-9A-HJ-NP-Za-km-z]{45,80}$/);
  });

  it("rejects UUID-derived placeholder DIDs", () => {
    const placeholder = "did:key:z6Mk" + "a".repeat(40);
    assert.equal(isDidKeyEd25519(placeholder), false);
    assert.equal(isLegacyPlaceholderDid(placeholder), true);
  });

  it("derives DID, multibase, and fingerprint from the same public key", () => {
    const raw = rawEd25519PublicKey();
    const did = encodeDidKeyFromRawPublicKey(raw);
    const binding = canonicalSsiBindingFromDid(did);
    assert.equal(binding.did, did);
    assert.equal(binding.publicKeyMultibase, did.slice("did:key:".length));
    assert.equal(binding.fingerprint, fingerprintFromRawPublicKey(raw));
    assert.equal(Buffer.from(binding.publicKey).equals(Buffer.from(raw)), true);
    const other = canonicalSsiBindingFromDid(encodeDidKeyFromRawPublicKey(rawEd25519PublicKey()));
    assert.notEqual(other.did, binding.did);
    assert.notEqual(other.fingerprint, binding.fingerprint);
    assert.notEqual(other.publicKeyMultibase, binding.publicKeyMultibase);
    assert.equal(binding.publicKeyMultibase, did.slice(8));
  });

  it("rejects non-canonical did:key strings", () => {
    const did = encodeDidKeyFromRawPublicKey(rawEd25519PublicKey());
    assert.throws(() => canonicalSsiBindingFromDid(`${did}1`), /did:key/);
    assert.throws(() => canonicalSsiBindingFromDid("did:key:z6Mk" + "a".repeat(40)), /did:key/);
  });

  it("rejects truncated or wrong-codec values", () => {
    assert.throws(() => resolveDidKey("did:web:example.com"));
    assert.throws(() => resolveDidKey("did:key:z"));
    assert.throws(() => encodeDidKeyFromRawPublicKey(new Uint8Array(31)));
  });
});
