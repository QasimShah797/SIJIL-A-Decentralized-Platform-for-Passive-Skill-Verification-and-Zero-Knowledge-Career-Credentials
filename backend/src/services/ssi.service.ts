import { AppError } from "../utils/AppError";
import { isMissingRelationError, isUniqueViolation } from "../utils/supabase-errors";
import {
  canonicalSsiBindingFromDid,
  isDidKeyEd25519,
} from "../utils/did-key";
import { verifyEd25519Utf8 } from "../utils/ed25519";
import { supabaseService } from "./supabase.service";
import {
  SsiChallengeStore,
  ssiChallengeStore,
  type SsiChallengeRecord,
} from "./ssi-challenge.store";
import { provenHolderDidFromIdentityRow, SSI_MIGRATION_HINT } from "./ssi-holder-did";

export const SSI_TABLE = "learner_ssi_identities";
export { SSI_MIGRATION_HINT };

export type SsiIdentityView = {
  did: string | null;
  fingerprint: string | null;
  boundAt: string | null;
  verificationMethod: string | null;
  tableReady: boolean;
  cryptographicallyBound: boolean;
};

export type SsiResolveView = {
  did: string;
  publicKeyMultibase: string;
  verificationMethod: string;
  publicKeyFingerprint: string;
  didDocument: {
    "@context": string[];
    id: string;
    verificationMethod: Array<{
      id: string;
      type: "Ed25519VerificationKey2020";
      controller: string;
      publicKeyMultibase: string;
    }>;
    authentication: string[];
    assertionMethod: string[];
  };
};

function ownershipMessage(payload: string, did: string): Buffer {
  return Buffer.from(`${payload}\ndid=${did}`, "utf8");
}

type SsiDbClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string; code?: string } | null }>;
      };
    };
    insert: (
      row: Record<string, unknown>,
    ) => Promise<{ error: { message?: string; code?: string } | null }>;
  };
};

export class SsiService {
  constructor(
    private readonly challenges: SsiChallengeStore = ssiChallengeStore,
    private readonly db: SsiDbClient = supabaseService.client as unknown as SsiDbClient,
  ) {}

  issueChallenge(userId: string): {
    challengeId: string;
    nonce: string;
    purpose: string;
    audience: string;
    expiresAt: string;
    payload: string;
  } {
    const record = this.challenges.issue(userId);
    return {
      challengeId: record.id,
      nonce: record.nonce,
      purpose: record.purpose,
      audience: record.audience,
      expiresAt: new Date(record.expiresAt).toISOString(),
      payload: record.payload,
    };
  }

  resolvePublic(did: string): SsiResolveView {
    try {
      const binding = canonicalSsiBindingFromDid(did);
      return {
        did: binding.did,
        publicKeyMultibase: binding.publicKeyMultibase,
        verificationMethod: binding.verificationMethod,
        publicKeyFingerprint: binding.fingerprint,
        didDocument: {
          "@context": ["https://www.w3.org/ns/did/v1"],
          id: binding.did,
          verificationMethod: [{
            id: binding.verificationMethod,
            type: "Ed25519VerificationKey2020",
            controller: binding.did,
            publicKeyMultibase: binding.publicKeyMultibase,
          }],
          authentication: [binding.verificationMethod],
          assertionMethod: [binding.verificationMethod],
        },
      };
    } catch (err) {
      throw new AppError(err instanceof Error ? err.message : "Invalid did:key", 400);
    }
  }

  async requireProvenHolderDid(userId: string): Promise<string> {
    const { data, error } = await this.db
      .from(SSI_TABLE)
      .select("user_id, did")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      if (isMissingRelationError(error)) {
        return provenHolderDidFromIdentityRow({
          requestUserId: userId,
          row: null,
          tableReady: false,
        });
      }
      throw new AppError(error.message ?? "SSI identity lookup failed", 500);
    }
    return provenHolderDidFromIdentityRow({
      requestUserId: userId,
      row: data,
      tableReady: true,
    });
  }

  async getIdentity(userId: string): Promise<SsiIdentityView> {
    const empty: SsiIdentityView = {
      did: null,
      fingerprint: null,
      boundAt: null,
      verificationMethod: null,
      tableReady: true,
      cryptographicallyBound: false,
    };
    const { data, error } = await this.db
      .from(SSI_TABLE)
      .select("did, fingerprint, bound_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      if (isMissingRelationError(error)) {
        return { ...empty, tableReady: false };
      }
      throw new AppError(error.message ?? "SSI identity lookup failed", 500);
    }
    const did = typeof data?.did === "string" ? data.did : null;
    const real = isDidKeyEd25519(did);
    return {
      did: real ? did : null,
      fingerprint: typeof data?.fingerprint === "string" ? data.fingerprint : null,
      boundAt: typeof data?.bound_at === "string" ? data.bound_at : null,
      verificationMethod: real && did ? `${did}#${did.slice("did:key:".length)}` : null,
      tableReady: true,
      cryptographicallyBound: real,
    };
  }

  async bindIdentity(
    userId: string,
    input: { challengeId: string; did: string; signature: string },
  ): Promise<SsiIdentityView> {
    let challenge: SsiChallengeRecord;
    try {
      challenge = this.challenges.peek(input.challengeId, userId);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 400;
      throw new AppError(err instanceof Error ? err.message : "Invalid challenge", status);
    }

    if (!isDidKeyEd25519(input.did)) {
      throw new AppError("DID must be a real Ed25519 did:key (not a placeholder)", 400);
    }
    let binding;
    try {
      binding = canonicalSsiBindingFromDid(input.did);
    } catch (err) {
      throw new AppError(err instanceof Error ? err.message : "DID must be a canonical Ed25519 did:key", 400);
    }
    const message = ownershipMessage(challenge.payload, binding.did);
    if (!verifyEd25519Utf8(binding.publicKey, message, input.signature)) {
      throw new AppError("Signature does not prove ownership of this did:key", 401);
    }

    try {
      this.challenges.consume(input.challengeId, userId);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 400;
      throw new AppError(err instanceof Error ? err.message : "Invalid challenge", status);
    }

    const boundAt = new Date().toISOString();
    const existing = await this.readBinding(userId, binding.did);
    if (existing.sameUserDifferentDid) {
      throw new AppError("This account already has a registered DID", 409);
    }
    if (existing.sameDidDifferentUser) {
      throw new AppError("This DID is already bound to another account", 409);
    }
    if (existing.alreadyBound) {
      return {
        did: binding.did,
        fingerprint: binding.fingerprint,
        boundAt: existing.boundAt ?? boundAt,
        verificationMethod: binding.verificationMethod,
        tableReady: true,
        cryptographicallyBound: true,
      };
    }

    const { error: writeError } = await this.db.from(SSI_TABLE).insert({
      user_id: userId,
      did: binding.did,
      fingerprint: binding.fingerprint,
      public_key_multibase: binding.publicKeyMultibase,
      bound_at: boundAt,
    });

    if (writeError) {
      if (isMissingRelationError(writeError)) {
        throw new AppError(SSI_MIGRATION_HINT, 503);
      }
      if (isUniqueViolation(writeError)) {
        const raced = await this.readBinding(userId, binding.did);
        if (raced.alreadyBound) {
          return {
            did: binding.did,
            fingerprint: binding.fingerprint,
            boundAt: raced.boundAt ?? boundAt,
            verificationMethod: binding.verificationMethod,
            tableReady: true,
            cryptographicallyBound: true,
          };
        }
        if (raced.sameUserDifferentDid) {
          throw new AppError("This account already has a registered DID", 409);
        }
        throw new AppError("This DID is already bound to another account", 409);
      }
      throw new AppError(writeError.message ?? "SSI identity write failed", 500);
    }

    return {
      did: binding.did,
      fingerprint: binding.fingerprint,
      boundAt,
      verificationMethod: binding.verificationMethod,
      tableReady: true,
      cryptographicallyBound: true,
    };
  }

  private async readBinding(userId: string, did: string): Promise<{
    alreadyBound: boolean;
    sameUserDifferentDid: boolean;
    sameDidDifferentUser: boolean;
    fingerprint: string | null;
    boundAt: string | null;
  }> {
    const byUser = await this.db.from(SSI_TABLE).select("user_id, did, fingerprint, bound_at").eq("user_id", userId).maybeSingle();
    if (byUser.error) {
      if (isMissingRelationError(byUser.error)) {
        throw new AppError(SSI_MIGRATION_HINT, 503);
      }
      throw new AppError(byUser.error.message ?? "SSI identity lookup failed", 500);
    }
    const byDid = await this.db.from(SSI_TABLE).select("user_id, did, fingerprint, bound_at").eq("did", did).maybeSingle();
    if (byDid.error) {
      if (isMissingRelationError(byDid.error)) {
        throw new AppError(SSI_MIGRATION_HINT, 503);
      }
      throw new AppError(byDid.error.message ?? "SSI identity lookup failed", 500);
    }
    const userDid = typeof byUser.data?.did === "string" ? byUser.data.did : null;
    const didUser = typeof byDid.data?.user_id === "string" ? byDid.data.user_id : null;
    return {
      alreadyBound: userDid === did && didUser === userId,
      sameUserDifferentDid: Boolean(userDid && userDid !== did),
      sameDidDifferentUser: Boolean(didUser && didUser !== userId),
      fingerprint: typeof byUser.data?.fingerprint === "string" ? byUser.data.fingerprint : null,
      boundAt: typeof byUser.data?.bound_at === "string" ? byUser.data.bound_at : null,
    };
  }
}

export const ssiService = new SsiService();
