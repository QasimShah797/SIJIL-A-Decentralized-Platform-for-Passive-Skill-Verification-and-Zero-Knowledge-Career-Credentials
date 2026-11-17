import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { EmptyState } from "@/components/sijil/EmptyState";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { ShareAchievementFlow, type ShareRecord } from "@/components/sharing/ShareAchievementFlow";
import { useAuth } from "@/hooks/useAuth";
import { useCredentials } from "@/hooks/useLearnerData";
import { useSsiIdentity } from "@/hooks/useSsiIdentity";
import { getCredentialDbId } from "@/lib/db/credentials";
import { eligiblePresentationCredentials } from "@/lib/ssi/presentation-selection";
import { signUtf8 } from "@/lib/ssi/keystore";
import { getUnlockedIdentity } from "@/lib/ssi/session";
import { presentationSubmitBody, walletShareRequest } from "@/lib/sharing/guide";
import type { WalletShareFieldId } from "@/lib/wallet-competency-shared";
import { apiRequest } from "@/services/api/client";
import {
  getWalletCompetenciesApi,
  revokeWalletShareApi,
  shareWalletCompetencyApi,
  type WalletCompetencyDetailView,
} from "@/services/api/wallet.api";
import {
  createPresentationChallengeApi,
  revokeLearnerPresentationApi,
  submitLearnerPresentationApi,
} from "@/services/api/ssi.api";

const LINK_FIELDS: Array<{ id: WalletShareFieldId; label: string }> = [
  { id: "competency_name", label: "Achievement name" },
  { id: "competency_domain", label: "Subject area" },
  { id: "verification_status", label: "Verification summary" },
  { id: "learner_name", label: "Your name" },
  { id: "learner_institution", label: "Institution" },
  { id: "learner_contact", label: "Contact details" },
];

function shareError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/privateKey|BEGIN PRIVATE KEY/i.test(message)) return "Sharing could not be completed.";
  if (/schema cache|does not exist|relation|API 5/i.test(message)) {
    return "A share link could not be created. Please try again.";
  }
  if (/revoked/i.test(message)) return "This achievement is revoked, so it cannot be shared.";
  if (/not found/i.test(message)) return "This achievement is not available to share from this account.";
  if (message && message.length < 180) return message;
  return "Sharing could not be completed. Please try again.";
}

export default function SelectiveDisclosure() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { credentials, loading } = useCredentials();
  const { snapshot } = useSsiIdentity();
  const credential = credentials.find((item) => item.id === decodeURIComponent(id || ""));
  const [competencyId, setCompetencyId] = useState<string | null>(null);
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultNote, setResultNote] = useState<string | null>(null);

  useEffect(() => {
    if (!credential) return;
    let active = true;
    getWalletCompetenciesApi()
      .then((rows) => {
        if (!active) return;
        const matches = (rows ?? []).filter((row) => row.competencyName === credential.skill);
        setCompetencyId(matches.length === 1 ? matches[0].competencyId : null);
      })
      .catch(() => {
        if (active) setCompetencyId(null);
      });
    return () => {
      active = false;
    };
  }, [credential]);

  useEffect(() => {
    if (!competencyId) return;
    let active = true;
    setHistoryUnavailable(false);
    apiRequest<WalletCompetencyDetailView>(`/wallet/competencies/${encodeURIComponent(competencyId)}`)
      .then((detail) => {
        if (!active) return;
        setShares(detail.shares.map((share) => ({
          token: share.id,
          label: share.recipientName
            ? `${credential?.skill ?? "Achievement"} · ${share.recipientName}`
            : credential?.skill ?? "Achievement",
          access: share.shareStatus === "Revoked"
            ? "revoked" as const
            : share.shareStatus === "Expired"
              ? "expired" as const
              : "active" as const,
          kind: share.recipientName ? "direct" as const : "link" as const,
          recipient: share.recipientOrganization
            ? `${share.recipientName} at ${share.recipientOrganization}`
            : share.recipientName,
          sharedAt: share.createdAt,
        })));
      })
      .catch(() => {
        if (!active) return;
        setHistoryUnavailable(true);
        setShares([]);
      });
    return () => {
      active = false;
    };
  }, [competencyId, credential?.skill, historyAttempt]);

  const createLink = async (input: { selectedFields: string[]; expiresInDays: number }) => {
    if (!competencyId) {
      setError("This achievement is not available for a field-limited link yet.");
      return;
    }
    setWorking(true);
    setError(null);
    setResultNote(null);
    try {
      const request = walletShareRequest({
        competencyId,
        selectedFields: input.selectedFields,
        expiresInDays: input.expiresInDays,
      });
      const created = await shareWalletCompetencyApi({
        ...request,
        selectedFields: request.selectedFields as WalletShareFieldId[],
      });
      setResultUrl(created.shareUrl);
      setShares((current) => [{
        token: created.shareId,
        label: credential?.skill ?? "Achievement",
        access: "active",
        kind: "link",
        sharedAt: new Date().toISOString(),
      }, ...current]);
    } catch (next) {
      setError(shareError(next));
    } finally {
      setWorking(false);
    }
  };

  const createAll = async (input: { selectedFields: string[]; expiresInDays: number }) => {
    if (!competencyId) {
      setError("This achievement is not available to share yet.");
      return;
    }
    setWorking(true);
    setError(null);
    setResultUrl(null);
    try {
      const request = walletShareRequest({
        competencyId,
        selectedFields: input.selectedFields,
        expiresInDays: input.expiresInDays,
      });
      const created = await shareWalletCompetencyApi({
        ...request,
        selectedFields: request.selectedFields as WalletShareFieldId[],
        shareAudience: "all-recruiters",
        consentToAllRecruiters: true,
      });
      setResultNote("Your achievements are now visible to all SIJIL recruiters.");
      setShares((current) => [{
        token: created.shareId,
        label: credential?.skill ?? "Achievement",
        access: "active",
        kind: "direct",
        recipient: "All SIJIL recruiters",
        sharedAt: new Date().toISOString(),
      }, ...current.filter((item) => item.token !== created.shareId)]);
    } catch (next) {
      setError(shareError(next));
    } finally {
      setWorking(false);
    }
  };

  const createSigned = async () => {
    if (!user || !credential) return;
    const signingIdentity = getUnlockedIdentity(user.id);
    const activeDid = signingIdentity?.did
      ?? (typeof snapshot.local?.did === "string" ? snapshot.local.did : null)
      ?? snapshot.server.did
      ?? null;
    if (!signingIdentity) {
      setError(snapshot.status === "locked"
        ? "Unlock your learning identity on this device before signing."
        : "Set up your learning identity on this device before signing.");
      return;
    }
    const eligible = eligiblePresentationCredentials([credential], activeDid);
    if (eligible.length === 0) {
      setError("This achievement is not tied to the identity on this device, so it cannot be signed here.");
      return;
    }
    setWorking(true);
    setError(null);
    setResultNote(null);
    try {
      const dbId = await getCredentialDbId(credential.id);
      const challenge = await createPresentationChallengeApi({
        credentialIds: [dbId ?? credential.id],
        audience: "sijil-recruiter-verify",
      });
      if (challenge.holderDid !== signingIdentity.did) {
        throw new Error("The identity on this device does not match the signed challenge.");
      }
      const signature = await signUtf8(signingIdentity.privateKey, challenge.canonicalPayload);
      const body = presentationSubmitBody({
        challengeId: challenge.challengeId,
        did: signingIdentity.did,
        signature,
      });
      const submitted = await submitLearnerPresentationApi(body);
      setResultUrl(submitted.verifyUrl);
      setShares((current) => [{
        token: submitted.presentationId,
        label: credential.skill,
        access: "active",
        kind: "presentation",
      }, ...current]);
    } catch (next) {
      setError(shareError(next));
    } finally {
      setWorking(false);
    }
  };

  const revoke = async (share: ShareRecord) => {
    setWorking(true);
    setError(null);
    try {
      if (share.kind === "presentation") {
        await revokeLearnerPresentationApi(share.token);
      } else {
        const stopped = await revokeWalletShareApi(share.token);
        if (!stopped) throw new Error("The link could not be stopped.");
      }
      setShares((current) => current.map((item) => (
        item.kind === share.kind && item.token === share.token
          ? { ...item, access: "revoked" }
          : item
      )));
    } catch (next) {
      setError(shareError(next));
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return <AppShell role="learner"><PageSkeleton rows={4} /></AppShell>;
  }

  if (!credential) {
    return (
      <AppShell role="learner">
        <EmptyState
          icon={ShieldAlert}
          title="Achievement not found"
          description="This achievement is not on your account."
          action={{ label: "Back", onClick: () => navigate("/learner/wallet") }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell role="learner">
      <PageHeader
        title="Share Achievement"
        description="Share with one registered recruiter, or create a public verification link. A public link does not add anyone to a recruiter dashboard."
        actions={(
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />Back
          </Button>
        )}
      />
      <ShareAchievementFlow
        skill={credential.skill}
        fields={LINK_FIELDS}
        linkAvailable={Boolean(competencyId)}
        zkp={{ verified: false, fabric: null }}
        shares={shares}
        working={working}
        error={error}
        resultUrl={resultUrl}
        resultNote={resultNote}
        onCreateLink={(input) => { void createLink(input); }}
        onCreateAll={(input) => { void createAll(input); }}
        onCreateSigned={() => { void createSigned(); }}
        onRevoke={(share) => { void revoke(share); }}
        historyUnavailable={historyUnavailable}
        onRetryHistory={() => setHistoryAttempt((attempt) => attempt + 1)}
      />
    </AppShell>
  );
}
