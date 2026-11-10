/**
 * Credentials API — backend layer for credential issuing and wallet operations.
 */
import { tryApiRequest } from "./client";
import type { CredentialView } from "@/lib/db/credentials";
import type { PortableCredentialFile } from "@/lib/credentials/portable";

export function issueCredentialRequestBody(skillId: string): { skillId: string } {
  return { skillId };
}

export async function issueCredentialApi(skillId: string): Promise<CredentialView | null> {
  return tryApiRequest<CredentialView>("/credentials/issue", {
    method: "POST",
    body: JSON.stringify(issueCredentialRequestBody(skillId)),
  });
}

export async function getCredentialDocumentApi(id: string): Promise<PortableCredentialFile | null> {
  return tryApiRequest<PortableCredentialFile>(`/credentials/${encodeURIComponent(id)}/document`);
}

export async function getTrustedIssuerKeyApi(issuerDid: string): Promise<string | null> {
  const data = await tryApiRequest<{ publicKeyPem?: string }>(
    `/public/issuers/${encodeURIComponent(issuerDid)}`,
  );
  return typeof data?.publicKeyPem === "string" ? data.publicKeyPem : null;
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
