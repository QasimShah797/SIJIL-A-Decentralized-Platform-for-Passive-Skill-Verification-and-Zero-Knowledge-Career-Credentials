/**
 * Credentials API — backend layer for credential issuing and wallet operations.
 */
import { tryApiRequest } from "./client";
import type { CredentialView } from "@/lib/db/credentials";

export async function issueCredentialApi(skillId: string): Promise<CredentialView | null> {
  return tryApiRequest<CredentialView>("/credentials/issue", {
    method: "POST",
    body: JSON.stringify({ skillId }),
  });
}

export async function getCredentialApi(id: string): Promise<CredentialView | null> {
  return tryApiRequest<CredentialView>(`/credentials/${encodeURIComponent(id)}`);
}

export async function getWalletApi(learnerId: string): Promise<CredentialView[] | null> {
  return tryApiRequest<CredentialView[]>(`/credentials/wallet/${learnerId}`);
}

export async function shareCredentialApi(input: {
  credentialId: string;
  recipient: string;
  recipientDid?: string;
  disclosedFields: { id: string; label: string; value: string }[];
  hiddenFields?: string[];
  expiresInDays?: number;
}): Promise<{ token: string; shareUrl: string } | null> {
  return tryApiRequest<{ token: string; shareUrl: string }>("/credentials/share", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function revokeShareApi(token: string): Promise<boolean> {
  const result = await tryApiRequest<null>("/credentials/revoke-share", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  return result !== null;
}
