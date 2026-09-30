/**
 * Recruiter credential verify — same service as GET /public/credentials/:id/verify.
 */
import type { CredentialVerifyResult } from "./credential-verify";

export async function recruiterVerifyCredential(
  credentialId: string,
  deps: {
    lookupPresentation: (token: string) => Promise<string | null>;
    verify: (id: string) => Promise<CredentialVerifyResult>;
  },
): Promise<CredentialVerifyResult> {
  const resolved = (await deps.lookupPresentation(credentialId)) ?? credentialId;
  return deps.verify(resolved);
}
