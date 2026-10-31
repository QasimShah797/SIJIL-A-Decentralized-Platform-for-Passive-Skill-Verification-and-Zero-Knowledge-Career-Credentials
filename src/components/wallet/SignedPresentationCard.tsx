import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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

function statusLabel(credential: CredentialView): string {
  if (credential.ledgerAnchorStatus === "anchored" || credential.anchorStatus === "anchored") {
    return "Anchored";
  }
  if (credential.verification === "verified" || credential.attestation === "attested") {
    return "Verified";
  }
  return credential.verification || credential.attestation || "Issued";
}

export function SignedPresentationCard() {
  const { credentials } = useCredentials();
  const { user } = useAuth();
  const { snapshot } = useSsiIdentity();
  const [audience, setAudience] = useState("sijil-recruiter-verify");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [working, setWorking] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);
  const [presentationId, setPresentationId] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);

  const unlocked = user?.id ? getUnlockedIdentity(user.id) : null;
  const activeDid = unlocked?.did
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

  const toggleCredential = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

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
    if (eligible.length === 0) {
      toast({
        title: "No DID-bound credentials",
        description: "Historical placeholder credentials can still be shared with a bearer link.",
        variant: "destructive",
      });
      return;
    }
    const chosen = eligible.filter((credential) => selectedIds.has(credential.id));
    if (chosen.length === 0) {
      toast({
        title: "Select at least one credential",
        description: "Nothing is shared until you choose which credentials to include.",
        variant: "destructive",
      });
      return;
    }
    setWorking(true);
    try {
      const credentialIds: string[] = [];
      for (const credential of chosen) {
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
      if (challenge.credentials.length !== credentialIds.length) {
        throw new Error("Server challenge credential set does not match your selection");
      }
      const signature = await signUtf8(signingIdentity.privateKey, challenge.canonicalPayload);
      const submitted = await submitLearnerPresentationApi({
        challengeId: challenge.challengeId,
        did: signingIdentity.did,
        signature,
      });
      setVerifyUrl(submitted.verifyUrl);
      setPresentationId(submitted.presentationId);
      setRevoked(false);
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

  const revokePresentation = async () => {
    if (!presentationId || revoked) return;
    const confirmed = window.confirm(
      "Revoke access to this signed presentation? Recruiters with the verify link will no longer see it. Your credentials and DID stay unchanged.",
    );
    if (!confirmed) return;
    setRevoking(true);
    try {
      await revokeLearnerPresentationApi(presentationId);
      setRevoked(true);
      toast({ title: "Presentation access revoked" });
    } catch (revokeError) {
      toast({
        title: "Could not revoke presentation",
        description: revokeError instanceof Error ? revokeError.message : "Revoke failed.",
        variant: "destructive",
      });
    } finally {
      setRevoking(false);
    }
  };

  return (
    <section className="learner-stat-card mb-4 space-y-3 px-4 py-4">
      <p className="text-sm font-semibold text-[#023E8A]">Learner-signed presentation</p>
      <p className="text-xs text-muted-foreground">
        Choose exactly which DID-bound credentials to share. Unselected credentials stay private.
        This is not a bearer share link and not a zero-knowledge proof.
      </p>
      <p className="text-xs text-muted-foreground">
        {eligible.length} eligible credential{eligible.length === 1 ? "" : "s"}
        {historical > 0 ? ` · ${historical} historical credential(s) stay on bearer share links` : ""}.
        Selection starts empty — nothing is shared automatically.
      </p>

      {eligible.length > 0 ? (
        <ul className="space-y-2 rounded-xl border border-border/60 p-3">
          {eligible.map((credential) => {
            const checked = selectedIds.has(credential.id);
            return (
              <li key={credential.id} className="flex items-start gap-3">
                <Checkbox
                  id={`vp-cred-${credential.id}`}
                  checked={checked}
                  onCheckedChange={(value) => toggleCredential(credential.id, value === true)}
                  className="mt-0.5"
                />
                <label htmlFor={`vp-cred-${credential.id}`} className="min-w-0 flex-1 cursor-pointer space-y-0.5">
                  <p className="text-sm font-medium text-foreground">
                    {credential.skill !== "—" ? credential.skill : credential.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Issuer: {credential.issuer || credential.issuerDid}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Status: {statusLabel(credential)}</p>
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          Unlock your SSI identity and issue DID-bound credentials to enable selective sharing.
        </p>
      )}

      <Input
        value={audience}
        onChange={(event) => setAudience(event.target.value)}
        placeholder="Intended verifier / audience"
      />
      <Button
        size="sm"
        disabled={working || selectedIds.size === 0}
        onClick={() => void createPresentation()}
      >
        {working ? "Signing…" : `Sign presentation (${selectedIds.size} selected)`}
      </Button>
      {verifyUrl && presentationId ? (
        <div className="space-y-2 rounded-xl border border-border/60 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {revoked ? "Revoked verify URL" : "Recruiter verify URL"}
          </p>
          <p className={`break-all font-mono text-xs ${revoked ? "text-muted-foreground line-through" : ""}`}>
            {verifyUrl}
          </p>
          {revoked ? (
            <p className="text-xs text-muted-foreground">
              Access revoked. This link no longer discloses presentation data. Your credentials are unchanged.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void navigator.clipboard.writeText(verifyUrl)}
              >
                Copy verify URL
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={revoking}
                onClick={() => void revokePresentation()}
              >
                {revoking ? "Revoking…" : "Revoke access"}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
