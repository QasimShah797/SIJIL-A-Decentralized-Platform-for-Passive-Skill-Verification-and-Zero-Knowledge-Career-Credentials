import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { EmptyState } from "@/components/sijil/EmptyState";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { ShareAchievementFlow } from "@/components/sharing/ShareAchievementFlow";
import { useCredentials } from "@/hooks/useLearnerData";
import { walletShareRequest } from "@/lib/sharing/guide";
import type { WalletShareFieldId } from "@/lib/wallet-competency-shared";
import {
  getWalletCompetenciesApi,
  shareWalletCompetencyApi,
} from "@/services/api/wallet.api";

const LINK_FIELDS: Array<{ id: WalletShareFieldId; label: string }> = [
  { id: "competency_name", label: "Achievement name" },
  { id: "competency_domain", label: "Subject area" },
  { id: "verification_status", label: "Skill confirmation summary" },
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
  const { credentials, loading } = useCredentials();
  const credential = credentials.find((item) => item.id === decodeURIComponent(id || ""));
  const [competencyId, setCompetencyId] = useState<string | null>(null);
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
      await shareWalletCompetencyApi({
        ...request,
        selectedFields: request.selectedFields as WalletShareFieldId[],
        shareAudience: "all-recruiters",
        consentToAllRecruiters: true,
      });
      setResultNote("Your achievements are now visible to all SIJIL recruiters.");
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
        description="Share with all SIJIL recruiters, or create a public verification link. Both options use the same disclosure selection."
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
        working={working}
        error={error}
        resultUrl={resultUrl}
        resultNote={resultNote}
        onCreateLink={(input) => { void createLink(input); }}
        onCreateAll={(input) => { void createAll(input); }}
        onCreateSigned={() => {
          setError("Use Share with All SIJIL Recruiters or Create Public Verification Link.");
        }}
      />
    </AppShell>
  );
}
