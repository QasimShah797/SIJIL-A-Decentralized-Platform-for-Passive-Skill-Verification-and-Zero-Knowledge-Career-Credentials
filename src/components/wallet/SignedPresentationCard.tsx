import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useSsiIdentity } from "@/hooks/useSsiIdentity";
import { useCredentials } from "@/hooks/useLearnerData";
import { isDidKeyEd25519 } from "@/lib/did";
import { getCredentialDbId } from "@/lib/db/credentials";
import { signUtf8 } from "@/lib/ssi/keystore";
import { getUnlockedIdentity } from "@/lib/ssi/session";
import {
  createPresentationChallengeApi,
  submitLearnerPresentationApi,
} from "@/services/api/ssi.api";

export function SignedPresentationCard() {
  const { credentials } = useCredentials();
  const { user } = useAuth();
  const { snapshot } = useSsiIdentity();
  const [audience, setAudience] = useState("sijil-recruiter-verify");
  const [working, setWorking] = useState(false);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);

  const bound = useMemo(
    () => credentials.filter((credential) => isDidKeyEd25519(credential.holderDid)),
    [credentials],
  );
  const historical = credentials.length - bound.length;

  const createPresentation = async () => {
    const signingIdentity = user?.id ? getUnlockedIdentity(user.id) : null;
    if (!signingIdentity) {
      toast({
        title: "Unlock your SSI identity first",
        description: snapshot.status === "locked"
          ? "Enter your passphrase to unlock the wallet."
          : "Activate SSI identity, then sign a presentation.",
        variant: "destructive",
      });
      return;
    }
    if (bound.length === 0) {
      toast({
        title: "No DID-bound credentials",
        description: "Historical placeholder credentials can still be shared with a bearer link.",
        variant: "destructive",
      });
      return;
    }
    setWorking(true);
    try {
      const credentialIds: string[] = [];
      for (const credential of bound) {
        const dbId = await getCredentialDbId(credential.id);
        credentialIds.push(dbId ?? credential.id);
      }
      const challenge = await createPresentationChallengeApi({
        credentialIds,
        audience: audience.trim() || "sijil-recruiter-verify",
      });
      if (challenge.holderDid !== signingIdentity.did) {
        throw new Error("Bound DID does not match this browser key");
      }
      const signature = await signUtf8(signingIdentity.privateKey, challenge.canonicalPayload);
      const submitted = await submitLearnerPresentationApi({
        challengeId: challenge.challengeId,
        did: signingIdentity.did,
        signature,
      });
      setVerifyUrl(submitted.verifyUrl);
      toast({ title: "Learner-signed presentation created" });
    } catch (createError) {
      toast({
        title: "Could not sign presentation",
        description: createError instanceof Error ? createError.message : "Signing failed.",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="learner-stat-card mb-4 space-y-3 px-4 py-4">
      <p className="text-sm font-semibold text-[#023E8A]">Learner-signed presentation</p>
      <p className="text-xs text-muted-foreground">
        This proves you currently hold the DID on DID-bound credentials. It is not a bearer share link
        and not a zero-knowledge proof. Issuer signatures and Fabric checks stay separate.
      </p>
      <p className="text-xs text-muted-foreground">
        {bound.length} DID-bound credential{bound.length === 1 ? "" : "s"} can be presented
        {historical > 0 ? ` · ${historical} historical credential(s) stay on bearer share links` : ""}.
      </p>
      <Input
        value={audience}
        onChange={(event) => setAudience(event.target.value)}
        placeholder="Intended verifier / audience"
      />
      <Button size="sm" disabled={working} onClick={() => void createPresentation()}>
        {working ? "Signing…" : "Sign presentation for recruiter"}
      </Button>
      {verifyUrl ? (
        <div className="rounded-xl border border-border/60 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Recruiter verify URL</p>
          <p className="break-all font-mono text-xs">{verifyUrl}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => void navigator.clipboard.writeText(verifyUrl)}
          >
            Copy verify URL
          </Button>
        </div>
      ) : null}
    </section>
  );
}
