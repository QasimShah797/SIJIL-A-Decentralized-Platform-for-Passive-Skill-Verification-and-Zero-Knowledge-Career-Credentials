import { isDidKeyEd25519 } from "@/lib/did";

/** Credentials eligible for a learner-signed VP: owned row bound to the active did:key only. */
export function eligiblePresentationCredentials<T extends { holderDid: string }>(
  credentials: T[],
  activeDid: string | null | undefined,
): T[] {
  if (!activeDid || !isDidKeyEd25519(activeDid)) return [];
  return credentials.filter((credential) => credential.holderDid === activeDid);
}
