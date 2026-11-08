import { useMemo, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useSsiIdentity } from "@/hooks/useSsiIdentity";
import { useCredentials } from "@/hooks/useLearnerData";
import { getCredentialDbId, type CredentialView } from "@/lib/db/credentials";
import { isDidKeyEd25519 } from "@/lib/did";
import { eligiblePresentationCredentials } from "@/lib/ssi/presentation-selection";
import { signUtf8 } from "@/lib/ssi/keystore";
import { getUnlockedIdentity } from "@/lib/ssi/session";
import {
  createPresentationChallengeApi,
  revokeLearnerPresentationApi,
  submitLearnerPresentationApi,
} from "@/services/api/ssi.api";
import { GuidedShareFlow } from "./GuidedShareFlow";

function statusLabel(credential: CredentialView): string {
  if (credential.ledgerAnchorStatus === "anchored" || credential.anchorStatus === "anchored") {
    return "Anchored";
  }
  if (credential.verification === "verified" || credential.attestation === "attested") {
    return "Verified";
  }
  return credential.verification || credential.attestation || "Issued";
}

export function SignedPresentationCard({ onBack }: { onBack: () => void }) {
  const { credentials } = useCredentials();
  const { user } = useAuth();
  const { snapshot, unlock, working: identityWorking, signingIdentity } = useSsiIdentity();
  const [audience, setAudience] = useState("sijil-recruiter-verify");

  const activeDid = signingIdentity?.did
    ?? (typeof snapshot.local?.did === "string" ? snapshot.local.did : null)
    ?? snapshot.server.did
    ?? null;

  const eligible = useMemo(
    () => eligiblePresentationCredentials(credentials, activeDid),
    [credentials, activeDid],
  );
  const historical = useMemo(
    () => credentials.filter((credential) => !isDidKeyEd25519(credential.holderDid)).length,
    [credentials],
  );
  const canSign = Boolean(signingIdentity);
  const identityNote = !canSign && snapshot.status === "key_unavailable"
    ? "This browser does not have the key for your identity. A new identity will not be created."
    : !canSign && snapshot.status !== "locked"
      ? "Set up your secure identity, then approve this share."
      : null;

  const createPresentation = async (input: { credentialIds: string[]; audience: string }) => {
    const currentIdentity = user?.id ? getUnlockedIdentity(user.id) : null;
    if (!currentIdentity) {
      const message = snapshot.status === "locked"
        ? "Enter your recovery password to continue."
        : "Set up your secure identity, then approve this share.";
      toast({ title: "Unlock your secure identity first", description: message, variant: "destructive" });
      throw new Error(message);
    }
    if (eligible.length === 0) {
      const message = "Older records can still be shared with a private link.";
      toast({ title: "No achievements can be signed yet", description: message, variant: "destructive" });
      throw new Error(message);
    }
    const chosen = eligible.filter((credential) => input.credentialIds.includes(credential.id));
    if (chosen.length === 0) {
      const message = "Nothing is shared until you choose which credentials to include.";
      toast({ title: "Select at least one credential", description: message, variant: "destructive" });
      throw new Error(message);
    }
    try {
      const credentialIds: string[] = [];
      for (const credential of chosen) {
        const dbId = await getCredentialDbId(credential.id);
        credentialIds.push(dbId ?? credential.id);
      }
      const challenge = await createPresentationChallengeApi({
        credentialIds,
        audience: input.audience.trim() || "sijil-recruiter-verify",
      });
      if (challenge.holderDid !== currentIdentity.did) {
        throw new Error("Bound DID does not match this browser key");
      }
      if (challenge.credentials.length !== credentialIds.length) {
        throw new Error("Server challenge credential set does not match your selection");
      }
      const signature = await signUtf8(currentIdentity.privateKey, challenge.canonicalPayload);
      const submitted = await submitLearnerPresentationApi({
        challengeId: challenge.challengeId,
        did: currentIdentity.did,
        signature,
      });
      toast({ title: "Signed share created" });
      return { verifyUrl: submitted.verifyUrl, presentationId: submitted.presentationId };
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Signing failed.";
      toast({ title: "Could not sign presentation", description: message, variant: "destructive" });
      throw createError instanceof Error ? createError : new Error(message);
    }
  };

  const revokePresentation = async (presentationId: string) => {
    const confirmed = window.confirm(
      "Stop access to this signed share? Anyone with the verify link will no longer see it. Your achievements and identity stay unchanged.",
    );
    if (!confirmed) return false;
    try {
      await revokeLearnerPresentationApi(presentationId);
      toast({ title: "Share access stopped" });
      return true;
    } catch (revokeError) {
      const message = revokeError instanceof Error ? revokeError.message : "Revoke failed.";
      toast({ title: "Could not revoke presentation", description: message, variant: "destructive" });
      throw revokeError instanceof Error ? revokeError : new Error(message);
    }
  };

  return (
    <GuidedShareFlow
      credentials={eligible.map((credential) => ({
        id: credential.id,
        title: credential.skill !== "—" ? credential.skill : credential.name,
        issuer: credential.issuer || credential.issuerDid,
        status: statusLabel(credential),
      }))}
      historicalCount={historical}
      canSign={canSign}
      identityLocked={snapshot.status === "locked"}
      identityNote={identityNote}
      audience={audience}
      onAudienceChange={setAudience}
      onUnlock={unlock}
      unlockWorking={identityWorking}
      onApprove={createPresentation}
      onRevoke={revokePresentation}
      onBack={onBack}
    />
  );
}
