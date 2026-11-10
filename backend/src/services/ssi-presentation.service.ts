import { randomUUID } from "node:crypto";
import { AppError } from "../utils/AppError";
import { isDidKeyEd25519 } from "../utils/did-key";
import type { CredentialVerifyResult } from "./credential-verify";
import type { CredentialDocument } from "./credential-document.service";
import {
  SSI_PRESENT_DEFAULT_AUDIENCE,
  SsiPresentationChallengeStore,
  ssiPresentationChallengeStore,
  type PresentationChallengeRecord,
} from "./ssi-presentation-challenge.store";
import {
  buildPresentationEnvelope,
  canonicalPresentationPayload,
  hashUnsignedCredentialDocument,
  verifyPresentationProof,
  type IssuerCredentialProof,
  type SijilVerifiablePresentation,
} from "./ssi-presentation-protocol";
import {
  MemoryPresentationRecordStore,
  presentationHashFromClaims,
  type PresentationRecordRow,
  type PresentationRecordStore,
} from "./ssi-presentation-record.store";

function toStoredPresentation(
  row: PresentationRecordRow,
  envelope: SijilVerifiablePresentation,
): StoredLearnerPresentation {
  return {
    id: row.id,
    challengeId: row.challengeId,
    learnerUserId: row.learnerUserId,
    holderDid: row.holderDid,
    envelope,
    createdAt: row.createdAt,
  };
}

export type PresentationCredentialSource = {
  id: string;
  userId: string;
  holderDid: string;
  document: CredentialDocument;
  proof: IssuerCredentialProof;
  hash: string;
  revokedAt: string | null;
};

export type StoredLearnerPresentation = {
  id: string;
  challengeId: string;
  learnerUserId: string;
  holderDid: string;
  envelope: SijilVerifiablePresentation;
  createdAt: string;
};

export type PresentationVerifyView = {
  presentationId: string;
  holderDid: string;
  holderProof: { ok: boolean; reason?: string; message?: string };
  credentials: Array<{
    credentialId: string;
    skill: string | null;
    issuer: string | null;
    holderBound: boolean;
    issuerIntegrity: { ok: boolean; status: CredentialVerifyResult["status"] };
    blockchain: {
      ok: boolean;
      status: CredentialVerifyResult["status"];
      anchorTxId: string | null;
      detail?: CredentialVerifyResult["detail"];
    };
    issuerAndLedger: CredentialVerifyResult;
  }>;
  kind: "learner-signed-vp";
};

export type PresentationServiceDeps = {
  loadCredentials: (ids: string[]) => Promise<PresentationCredentialSource[]>;
  requireHolderDid: (userId: string) => Promise<string>;
  verifyIssued: (credentialId: string) => Promise<CredentialVerifyResult>;
};

export class SsiPresentationService {
  constructor(
    private readonly deps: PresentationServiceDeps,
    private readonly challenges: SsiPresentationChallengeStore = ssiPresentationChallengeStore,
    private readonly records: PresentationRecordStore = new MemoryPresentationRecordStore(),
  ) {}

  async issueChallenge(
    learnerUserId: string,
    input: { credentialIds: string[]; audience?: string },
  ): Promise<PresentationChallengeRecord> {
    const holderDid = await this.deps.requireHolderDid(learnerUserId);
    if (!isDidKeyEd25519(holderDid)) {
      throw new AppError("A proven learner did:key is required before creating a presentation", 409);
    }
    const ids = uniqueIds(input.credentialIds);
    const rows = await this.deps.loadCredentials(ids);
    if (rows.length !== ids.length) {
      throw new AppError("One or more credentials were not found", 404);
    }
    const credentials = rows.map((row) => {
      if (row.userId !== learnerUserId) {
        throw new AppError("Cannot present a credential you do not own", 403);
      }
      if (row.revokedAt) {
        throw new AppError("Cannot present a revoked credential", 409);
      }
      if (!isDidKeyEd25519(row.holderDid)) {
        throw new AppError(
          "This credential uses a historical placeholder DID and cannot be learner-signed. Use a bearer share link instead.",
          409,
        );
      }
      if (row.holderDid !== holderDid) {
        throw new AppError("Credential holder DID does not match the bound learner identity", 409);
      }
      const hash = hashUnsignedCredentialDocument(row.document);
      if (hash !== row.hash) {
        throw new AppError("Stored credential hash does not match the unsigned document", 409);
      }
      if (row.document.credentialSubject.id !== holderDid) {
        throw new AppError("credentialSubject.id does not match the bound learner DID", 409);
      }
      return { id: row.id, hash };
    });
    return this.challenges.issue({
      learnerUserId,
      holderDid,
      audience: input.audience?.trim() || SSI_PRESENT_DEFAULT_AUDIENCE,
      credentials,
    });
  }

  challengeView(record: PresentationChallengeRecord) {
    return {
      challengeId: record.id,
      nonce: record.nonce,
      purpose: record.claims.purpose,
      protocol: record.claims.protocol,
      audience: record.audience,
      holderDid: record.holderDid,
      credentials: record.credentials,
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
      canonicalPayload: canonicalPresentationPayload(record.claims),
    };
  }

  async submit(
    learnerUserId: string,
    input: { challengeId: string; did: string; signature: string },
  ): Promise<StoredLearnerPresentation> {
    const challenge = await this.challenges.begin(input.challengeId, learnerUserId);
    let persistedId: string | null = null;
    try {
      if (input.did !== challenge.holderDid) {
        throw new AppError("Presentation DID does not match the bound holder", 401);
      }
      const rows = await this.deps.loadCredentials(challenge.credentialIds);
      const envelope = buildPresentationEnvelope({
        claims: challenge.claims,
        credentials: rows.map((row) => ({
          id: row.id,
          document: row.document,
          proof: row.proof,
        })),
        proofValue: input.signature,
      });
      const proof = verifyPresentationProof(envelope);
      if (!proof.ok) {
        throw new AppError(proof.message, proof.reason === "expired" ? 400 : 401);
      }

      // Persist before consuming the challenge so a storage failure can still allow retry.
      const record = await this.records.insert({
        id: randomUUID(),
        challengeId: challenge.id,
        learnerUserId,
        holderDid: challenge.holderDid,
        credentialIds: challenge.credentialIds,
        claims: challenge.claims,
        proofValue: input.signature,
      });
      persistedId = record.id;

      try {
        await this.challenges.consume(input.challengeId, learnerUserId);
      } catch (consumeError) {
        await this.records.deleteById(record.id);
        throw consumeError;
      }

      return toStoredPresentation(record, envelope);
    } catch (err) {
      await this.challenges.abort(input.challengeId);
      if (persistedId) {
        try {
          await this.records.deleteById(persistedId);
        } catch {
          // Prefer the original error; orphan cleanup is best-effort after abort.
        }
      }
      if (err instanceof AppError) throw err;
      const status = (err as { statusCode?: number }).statusCode ?? 400;
      throw new AppError(err instanceof Error ? err.message : "Invalid presentation", status);
    }
  }

  async getEnvelope(presentationId: string): Promise<StoredLearnerPresentation> {
    return this.loadStored(presentationId);
  }

  /**
   * Learner-controlled revoke of one presentation verify link.
   * Ownership comes from authenticated learnerUserId only.
   * Idempotent: already-revoked returns success without changing credentials/DID.
   */
  async revoke(
    learnerUserId: string,
    presentationId: string,
  ): Promise<{ presentationId: string; revokedAt: string; alreadyRevoked: boolean }> {
    try {
      const before = await this.records.getById(presentationId);
      if (!before) throw new AppError("Presentation not found", 404);
      if (before.learnerUserId !== learnerUserId) {
        throw new AppError("Not authorized to revoke this presentation", 403);
      }
      const alreadyRevoked = Boolean(before.revokedAt);
      const row = await this.records.revokeForOwner(
        presentationId,
        learnerUserId,
        before.revokedAt ?? new Date().toISOString(),
      );
      if (!row.revokedAt) {
        throw new AppError("Could not revoke presentation", 503);
      }
      return {
        presentationId: row.id,
        revokedAt: row.revokedAt,
        alreadyRevoked,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      const status = (err as { statusCode?: number }).statusCode ?? 503;
      throw new AppError(err instanceof Error ? err.message : "Could not revoke presentation", status);
    }
  }

  async verify(presentationId: string, now?: Date): Promise<PresentationVerifyView> {
    const stored = await this.loadStored(presentationId);
    const holder = verifyPresentationProof(stored.envelope, now);
    const credentials = await Promise.all(stored.envelope.sijilCredentialIds.map(async (credentialId, index) => {
      const embedded = stored.envelope.verifiableCredential[index];
      const holderBound = Boolean(
        embedded
        && embedded.credentialSubject.id === stored.holderDid
        && stored.holderDid === stored.envelope.holder,
      );
      const issuerAndLedger = await this.deps.verifyIssued(credentialId);
      const issuerIntegrityOk = issuerAndLedger.status !== "tampered" && issuerAndLedger.status !== "not_found";
      const blockchainOk = issuerAndLedger.status === "verified" && issuerAndLedger.detail !== "legacy_unverified_evidence";
      return {
        credentialId,
        skill: typeof embedded?.credentialSubject?.skill === "string"
          ? embedded.credentialSubject.skill
          : null,
        issuer: typeof embedded?.issuer === "string" ? embedded.issuer : null,
        holderBound,
        issuerIntegrity: { ok: issuerIntegrityOk, status: issuerAndLedger.status },
        blockchain: {
          ok: blockchainOk,
          status: issuerAndLedger.status,
          anchorTxId: issuerAndLedger.anchorTxId,
          detail: issuerAndLedger.detail,
        },
        issuerAndLedger,
      };
    }));
    return {
      presentationId: stored.id,
      holderDid: stored.holderDid,
      holderProof: holder.ok
        ? { ok: true }
        : { ok: false, reason: holder.reason, message: holder.message },
      credentials,
      kind: "learner-signed-vp",
    };
  }

  private async loadStored(presentationId: string): Promise<StoredLearnerPresentation> {
    const row = await this.records.getById(presentationId);
    if (!row) throw new AppError("Presentation not found", 404);
    // Reject revoked VPs before reconstructing credentials or returning protected data.
    if (row.revokedAt) {
      throw new AppError("Presentation revoked", 410);
    }

    let challenge: PresentationChallengeRecord;
    try {
      challenge = await this.challenges.getIncludingUsed(row.challengeId);
    } catch (err) {
      if (err instanceof AppError) throw err;
      const status = (err as { statusCode?: number }).statusCode ?? 503;
      throw new AppError(
        err instanceof Error ? err.message : "Could not load presentation challenge",
        status === 404 ? 404 : 503,
      );
    }
    if (challenge.learnerUserId !== row.learnerUserId || challenge.holderDid !== row.holderDid) {
      throw new AppError("Presentation record does not match its challenge", 409);
    }
    if (presentationHashFromClaims(challenge.claims) !== row.presentationHash) {
      throw new AppError("Presentation hash does not match the challenge claims", 409);
    }

    const rows = await this.deps.loadCredentials(row.credentialIds);
    if (rows.length !== row.credentialIds.length) {
      throw new AppError("One or more presented credentials are no longer available", 404);
    }
    for (const credential of rows) {
      if (credential.userId !== row.learnerUserId) {
        throw new AppError("Presentation credentials failed ownership check", 403);
      }
    }

    const envelope = buildPresentationEnvelope({
      claims: challenge.claims,
      credentials: rows.map((credential) => ({
        id: credential.id,
        document: credential.document,
        proof: credential.proof,
      })),
      proofValue: row.proofValue,
    });
    return toStoredPresentation(row, envelope);
  }
}

function uniqueIds(ids: string[]): string[] {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new AppError("credentialIds must be a non-empty array", 400);
  }
  const next = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (next.length === 0) throw new AppError("credentialIds must be a non-empty array", 400);
  return next;
}
