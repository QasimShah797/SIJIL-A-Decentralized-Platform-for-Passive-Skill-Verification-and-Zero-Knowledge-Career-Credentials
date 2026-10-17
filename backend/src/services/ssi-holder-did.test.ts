import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { encodeDidKeyFromRawPublicKey } from "../utils/did-key";
import { AppError } from "../utils/AppError";
import {
  provenHolderDidFromIdentityRow,
  SSI_IDENTITY_INVALID_MESSAGE,
  SSI_IDENTITY_OWNER_MISMATCH_MESSAGE,
  SSI_IDENTITY_REQUIRED_MESSAGE,
  SSI_MIGRATION_HINT,
} from "./ssi-holder-did";

const LEARNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function realDid() {
  const { publicKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const raw = new Uint8Array(der.subarray(der.byteLength - 32));
  return encodeDidKeyFromRawPublicKey(raw);
}

function thrown(fn: () => unknown): AppError {
  try {
    fn();
  } catch (err) {
    assert.equal(err instanceof AppError, true);
    return err as AppError;
  }
  throw new Error("expected AppError");
}

describe("proven holder DID for issuance", () => {
  it("returns the canonical did:key bound to the authenticated learner", () => {
    const did = realDid();
    const resolved = provenHolderDidFromIdentityRow({
      requestUserId: LEARNER,
      row: { user_id: LEARNER, did },
      tableReady: true,
    });
    assert.equal(resolved, did);
  });

  it("rejects issuance when no SSI identity exists", () => {
    const err = thrown(() => provenHolderDidFromIdentityRow({
      requestUserId: LEARNER,
      row: null,
      tableReady: true,
    }));
    assert.equal(err.statusCode, 409);
    assert.equal(err.message, SSI_IDENTITY_REQUIRED_MESSAGE);
  });

  it("rejects a DID registered to another account", () => {
    const err = thrown(() => provenHolderDidFromIdentityRow({
      requestUserId: LEARNER,
      row: { user_id: OTHER, did: realDid() },
      tableReady: true,
    }));
    assert.equal(err.statusCode, 403);
    assert.equal(err.message, SSI_IDENTITY_OWNER_MISMATCH_MESSAGE);
  });

  it("rejects a placeholder or invalid DID", () => {
    const placeholder = thrown(() => provenHolderDidFromIdentityRow({
      requestUserId: LEARNER,
      row: { user_id: LEARNER, did: "did:key:z6Mk" + "a".repeat(40) },
      tableReady: true,
    }));
    assert.equal(placeholder.statusCode, 409);
    assert.equal(placeholder.message, SSI_IDENTITY_INVALID_MESSAGE);

    const invalid = thrown(() => provenHolderDidFromIdentityRow({
      requestUserId: LEARNER,
      row: { user_id: LEARNER, did: "did:web:example.com" },
      tableReady: true,
    }));
    assert.equal(invalid.statusCode, 409);
  });

  it("does not treat a missing SSI table as an issued credential", () => {
    const err = thrown(() => provenHolderDidFromIdentityRow({
      requestUserId: LEARNER,
      row: null,
      tableReady: false,
    }));
    assert.equal(err.statusCode, 503);
    assert.equal(err.message, SSI_MIGRATION_HINT);
  });
});
