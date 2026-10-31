import { apiRequest, isApiEnabled, tryApiRequest } from "./client";

export type SsiChallengeView = {
  challengeId: string;
  nonce: string;
  purpose: string;
  audience: string;
  expiresAt: string;
  payload: string;
};

export type SsiIdentityApiView = {
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
  didDocument?: {
    id: string;
    verificationMethod: Array<{ id: string; type: string; controller: string; publicKeyMultibase: string }>;
  };
};

export type PresentationChallengeApiView = {
  challengeId: string;
  nonce: string;
  purpose: string;
  protocol: string;
  audience: string;
  holderDid: string;
  credentials: Array<{ id: string; hash: string }>;
  issuedAt: string;
  expiresAt: string;
  canonicalPayload: string;
};

export type LearnerPresentationSubmitView = {
  presentationId: string;
  holderDid: string;
  verifyUrl: string;
  kind: "learner-signed-vp";
};

export type PublicVpVerification = {
  presentationId: string;
  holderDid: string;
  holderProof: { ok: boolean; reason?: string; message?: string };
  credentials: Array<{
    credentialId: string;
    skill: string | null;
    issuer: string | null;
    holderBound: boolean;
    issuerIntegrity: { ok: boolean; status: string };
    blockchain: { ok: boolean; status: string; anchorTxId: string | null; detail?: string };
    issuerAndLedger: {
      status: string;
      credentialId: string;
      hash: string | null;
      anchorTxId: string | null;
      detail?: string;
    };
  }>;
  kind: "learner-signed-vp";
};

export async function getSsiIdentityApi(): Promise<SsiIdentityApiView | null> {
  if (!isApiEnabled()) return null;
  return tryApiRequest<SsiIdentityApiView>("/ssi/identity");
}

export async function createSsiChallengeApi(): Promise<SsiChallengeView> {
  return apiRequest<SsiChallengeView>("/ssi/challenge", { method: "POST" });
}

export async function bindSsiIdentityApi(body: {
  challengeId: string;
  did: string;
  signature: string;
}): Promise<SsiIdentityApiView> {
  return apiRequest<SsiIdentityApiView>("/ssi/bind", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function resolveSsiDidApi(did: string): Promise<SsiResolveView> {
  return apiRequest<SsiResolveView>(`/ssi/resolve?did=${encodeURIComponent(did)}`);
}

export async function createPresentationChallengeApi(body: {
  credentialIds: string[];
  audience?: string;
}): Promise<PresentationChallengeApiView> {
  return apiRequest<PresentationChallengeApiView>("/ssi/presentations/challenge", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function submitLearnerPresentationApi(body: {
  challengeId: string;
  did: string;
  signature: string;
}): Promise<LearnerPresentationSubmitView> {
  return apiRequest<LearnerPresentationSubmitView>("/ssi/presentations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type LearnerPresentationRevokeView = {
  presentationId: string;
  revokedAt: string;
  alreadyRevoked: boolean;
  kind: "learner-signed-vp";
};

export async function revokeLearnerPresentationApi(
  presentationId: string,
): Promise<LearnerPresentationRevokeView> {
  return apiRequest<LearnerPresentationRevokeView>(
    `/ssi/presentations/${encodeURIComponent(presentationId)}/revoke`,
    { method: "POST" },
  );
}

export async function getPublicVpApi(id: string): Promise<{
  presentationId: string;
  holderDid: string;
  verification: PublicVpVerification;
  kind: "learner-signed-vp";
}> {
  return apiRequest(`/public/vp/${encodeURIComponent(id)}`);
}
