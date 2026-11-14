import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { AppError } from "../utils/AppError";
import { clientErrorMessage } from "../middleware/error.middleware";
import { encodeDidKeyFromRawPublicKey, resolveDidKey } from "../utils/did-key";
import { CREDENTIAL_CRYPTOSUITE } from "./signing.service";
import { SSI_PRESENT_CRYPTOSUITE } from "./ssi-presentation-protocol";

describe("client error messages", () => {
  it("hides database and secret details on server failures", () => {
    const leaked = clientErrorMessage(new AppError("relation presentations does not exist", 500));
    assert.equal(leaked, "Internal server error");
    const unavailable = clientErrorMessage(new AppError("schema cache miss for private key", 503));
    assert.equal(unavailable, "This action is temporarily unavailable.");
    const kept = clientErrorMessage(new AppError("Sharing history temporarily unavailable", 503));
    assert.equal(kept, "Sharing history temporarily unavailable");
  });
});

describe("SSI interoperability boundaries", () => {
  it("uses did:key Ed25519 multicodec and does not claim a W3C presentation suite", () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const raw = publicKey.export({ type: "spki", format: "der" }).subarray(-32);
    const did = encodeDidKeyFromRawPublicKey(raw);
    const resolved = resolveDidKey(did);
    assert.equal(resolved.publicKey.byteLength, 32);
    assert.equal(resolved.verificationMethod, `${did}#${resolved.publicKeyMultibase}`);
    assert.equal(CREDENTIAL_CRYPTOSUITE, "eddsa-jcs-2022");
    assert.equal(SSI_PRESENT_CRYPTOSUITE, "sijil-ed25519-jcs-utf8-2026");
    assert.notEqual(SSI_PRESENT_CRYPTOSUITE, "eddsa-jcs-2022");
  });
});
