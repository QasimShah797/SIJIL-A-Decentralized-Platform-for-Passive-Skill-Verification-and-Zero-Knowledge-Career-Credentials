import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { PIPELINE_STAGE } from "../constants/status";
import { encodeDidKeyFromRawPublicKey } from "../utils/did-key";
import { signSha256Hash, verifySha256Hash } from "../utils/ed25519";
import { AppError } from "../utils/AppError";
import { CredentialsService } from "./credentials.service";
import { issueCredentialSchema } from "../validators/credentials.validator";
import { SSI_IDENTITY_REQUIRED_MESSAGE } from "./ssi-holder-did";
import { evaluateCredentialVerification } from "./credential-verify";
import { buildCredentialDocument } from "./credential-document.service";
function holderDidFromUserId(userId: string): string {
  const compact = userId.replace(/-/g, "");
  return `did:key:z6Mk${compact.slice(0, 32)}${compact.slice(-8)}`;
}

const LEARNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const SKILL_ID = "32b45b94-a03b-4692-857f-9d28da0a706a";

function realDid() {
  const { publicKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  return encodeDidKeyFromRawPublicKey(new Uint8Array(der.subarray(der.byteLength - 32)));
}

function issuerKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

class MemoryIssueDb {
  skills: Record<string, unknown>[] = [];
  evidence: Record<string, unknown>[] = [];
  credentials: Record<string, unknown>[] = [];
  profiles: Record<string, unknown>[] = [];
  inserted: Record<string, unknown>[] = [];
  skillUpdates: Record<string, unknown>[] = [];

  from(table: string) {
    const filters: Record<string, string> = {};
    const self = this;
    let pendingInsert: Record<string, unknown> | null = null;
    let pendingUpdate: Record<string, unknown> | null = null;
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: string) {
        filters[column] = value;
        return builder;
      },
      order() {
        return builder;
      },
      insert(row: Record<string, unknown>) {
        pendingInsert = row;
        return builder;
      },
      update(row: Record<string, unknown>) {
        pendingUpdate = row;
        return builder;
      },
      async maybeSingle() {
        const rows = self.rowsFor(table).filter((row) =>
          Object.entries(filters).every(([column, value]) => String((row as Record<string, unknown>)[column]) === value),
        );
        return { data: rows[0] ?? null, error: null };
      },
      async single() {
        if (table === "credentials" && pendingInsert) {
          const stored = {
            id: "cred-row-1",
            created_at: "2026-10-16T00:00:00.000Z",
            updated_at: "2026-10-16T00:00:00.000Z",
            ...pendingInsert,
          };
          self.credentials.push(stored);
          self.inserted.push(stored);
          return { data: stored, error: null };
        }
        return { data: null, error: { message: "unexpected single()" } };
      },
      then(onFulfilled: (value: { data: unknown; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
        if (pendingUpdate && table === "declared_skills") {
          self.skillUpdates.push({ ...pendingUpdate, ...filters });
          return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
        }
        const rows = self.rowsFor(table).filter((row) =>
          Object.entries(filters).every(([column, value]) => String((row as Record<string, unknown>)[column]) === value),
        );
        return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  private rowsFor(table: string): Record<string, unknown>[] {
    if (table === "declared_skills") return this.skills;
    if (table === "supporting_records") return this.evidence;
    if (table === "credentials") return this.credentials;
    if (table === "learner_profiles") return this.profiles;
    return [];
  }
}

function seedEligible(db: MemoryIssueDb, ownerId = LEARNER) {
  db.skills.push({
    id: SKILL_ID,
    user_id: ownerId,
    name: "TypeScript",
    pipeline_stage: PIPELINE_STAGE.WALLET_READY,
  });
  db.evidence.push({
    user_id: ownerId,
    skill_id: SKILL_ID,
    source: "LMS",
    title: "TypeScript course",
    url: "https://example.edu/ts",
    content_hash: "aa".repeat(32),
  });
  db.profiles.push({
    user_id: ownerId,
    institution_name: "CUST",
    holder_did: `did:key:z6Mk${"b".repeat(40)}`,
  });
}

describe("DID-bound credential issuance", () => {
  it("does not accept a client-supplied DID on the issue body", () => {
    const parsed = issueCredentialSchema.safeParse({
      skillId: SKILL_ID,
      did: realDid(),
      holderDid: realDid(),
      privateKey: "leak",
    });
    assert.equal(parsed.success, false);
    assert.equal(issueCredentialSchema.parse({ skillId: SKILL_ID }).skillId, SKILL_ID);
  });

  it("binds a new credential to the proven learner did:key and signs with the issuer key", async () => {
    const db = new MemoryIssueDb();
    seedEligible(db);
    const did = realDid();
    const keys = issuerKeys();
    const service = new CredentialsService({
      db: db as never,
      requireProvenHolderDid: async (userId) => {
        assert.equal(userId, LEARNER);
        return did;
      },
      signHash: (hash) => signSha256Hash(hash, keys.privatePem),
    });

    const issued = await service.issue(LEARNER, { skillId: SKILL_ID });
    const stored = db.inserted[0];
    const document = stored?.credential_document as {
      credentialSubject: { id: string };
    };

    assert.equal(issued.holderDid, did);
    assert.equal(stored?.holder_did, did);
    assert.equal(document.credentialSubject.id, did);
    assert.equal(document.credentialSubject.id, stored?.holder_did);
    assert.notEqual(issued.holderDid, db.profiles[0]?.holder_did);
    assert.equal(verifySha256Hash(String(stored?.credential_hash), String((stored?.proof as { proofValue: string }).proofValue), keys.publicPem), true);
    assert.equal(db.skillUpdates[0]?.pipeline_stage, PIPELINE_STAGE.IN_WALLET);
    const serialized = JSON.stringify({ issued, stored });
    assert.equal(/BEGIN (PRIVATE|RSA) KEY|pkcs8|privateKey/i.test(serialized), false);
    assert.equal(serialized.includes(keys.privatePem), false);
  });

  it("rejects new issuance when the learner has no SSI identity", async () => {
    const db = new MemoryIssueDb();
    seedEligible(db);
    const service = new CredentialsService({
      db: db as never,
      requireProvenHolderDid: async () => {
        throw new AppError(SSI_IDENTITY_REQUIRED_MESSAGE, 409);
      },
      signHash: () => "unused",
    });
    await assert.rejects(
      () => service.issue(LEARNER, { skillId: SKILL_ID }),
      (err: unknown) => {
        assert.equal(err instanceof AppError, true);
        assert.equal((err as AppError).statusCode, 409);
        assert.equal((err as AppError).message, SSI_IDENTITY_REQUIRED_MESSAGE);
        return true;
      },
    );
    assert.equal(db.inserted.length, 0);
  });

  it("rejects issuing another learner's skill before DID lookup", async () => {
    const db = new MemoryIssueDb();
    seedEligible(db, OTHER);
    let didLookups = 0;
    const service = new CredentialsService({
      db: db as never,
      requireProvenHolderDid: async () => {
        didLookups += 1;
        return realDid();
      },
      signHash: () => "unused",
    });
    await assert.rejects(
      () => service.issue(LEARNER, { skillId: SKILL_ID }),
      /does not belong/,
    );
    assert.equal(didLookups, 0);
    assert.equal(db.inserted.length, 0);
  });

  it("returns an existing credential unchanged without rewriting the holder DID", async () => {
    const db = new MemoryIssueDb();
    seedEligible(db);
    const historicalDid = `did:key:z6Mk${"c".repeat(40)}`;
    db.credentials.push({
      id: "historical",
      user_id: LEARNER,
      credential_uri: "urn:uuid:sijil:historical",
      name: "TypeScript Competency Credential",
      credential_types: ["VerifiableCredential", "OpenBadgeCredential"],
      issuer_name: "CUST",
      issuer_did: "did:web:issuer.cust.edu.pk",
      holder_did: historicalDid,
      valid_from: "2026-01-01T00:00:00.000Z",
      verification_status: "Verified",
      attestation_status: "Approved",
      supporting_records: 1,
      skill_name: "TypeScript",
      proof: { proofValue: "legacy" },
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    let didLookups = 0;
    const service = new CredentialsService({
      db: db as never,
      requireProvenHolderDid: async () => {
        didLookups += 1;
        return realDid();
      },
      signHash: () => "unused",
    });
    const issued = await service.issue(LEARNER, { skillId: SKILL_ID });
    assert.equal(issued.holderDid, historicalDid);
    assert.equal(didLookups, 0);
    assert.equal(db.inserted.length, 0);
  });
});

describe("issuer verify compatibility", () => {
  it("verifies both placeholder historical documents and DID-bound documents", async () => {
    const keys = issuerKeys();
    const placeholder = holderDidFromUserId(LEARNER);
    const boundDid = realDid();
    const historical = buildCredentialDocument({
      credentialUri: "urn:uuid:sijil:legacy",
      issuerDid: "did:web:issuer.cust.edu.pk",
      holderDid: placeholder,
      skill: "TypeScript",
      evidenceCount: 1,
      evidenceHashes: ["aa".repeat(32)],
      validFrom: "2026-01-01T00:00:00.000Z",
    });
    const fresh = buildCredentialDocument({
      credentialUri: "urn:uuid:sijil:fresh",
      issuerDid: "did:web:issuer.cust.edu.pk",
      holderDid: boundDid,
      skill: "TypeScript",
      evidenceCount: 1,
      evidenceHashes: ["aa".repeat(32)],
      validFrom: "2026-10-16T00:00:00.000Z",
    });
    const ledger = {
      isEnabled: () => true,
      isReachable: async () => true,
      anchorCredential: async () => ({ txId: "tx" }),
      revokeCredential: async () => ({ txId: "tx" }),
      verifyCredential: async () => ({ exists: true, hashMatches: true, status: "active" }),
      getHistory: async () => [],
      close: () => undefined,
    };
    const deps = {
      verifySignature: (hash: string, proof: string) => verifySha256Hash(hash, proof, keys.publicPem),
      ledger,
    };
    const historicalResult = await evaluateCredentialVerification({
      found: true,
      credentialId: "legacy",
      storedHash: historical.sha256Hash,
      storedDocument: historical.document,
      proofValue: signSha256Hash(historical.sha256Hash, keys.privatePem),
      revokedAt: null,
      anchorStatus: "anchored",
      anchorTxId: "tx-legacy",
      anchoredAt: "2026-01-01T01:00:00.000Z",
    }, deps);
    const freshResult = await evaluateCredentialVerification({
      found: true,
      credentialId: "fresh",
      storedHash: fresh.sha256Hash,
      storedDocument: fresh.document,
      proofValue: signSha256Hash(fresh.sha256Hash, keys.privatePem),
      revokedAt: null,
      anchorStatus: "anchored",
      anchorTxId: "tx-fresh",
      anchoredAt: "2026-10-16T01:00:00.000Z",
    }, deps);
    assert.equal(historical.document.credentialSubject.id, placeholder);
    assert.equal(fresh.document.credentialSubject.id, boundDid);
    assert.equal(historicalResult.status, "verified");
    assert.equal(freshResult.status, "verified");
  });
});
