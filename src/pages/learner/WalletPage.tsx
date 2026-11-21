import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LearnerWorkspaceShell } from "@/components/sijil/LearnerWorkspaceShell";
import { PageSkeleton } from "@/components/sijil/SkeletonLoader";
import { useAuth } from "@/hooks/useAuth";
import { useCredentials, useLearnerProfile } from "@/hooks/useLearnerData";
import {
  fetchWalletCompetencyRecords,
  type WalletCompetencyRecordView,
} from "@/lib/db/wallet-competency-records";
import { toast } from "@/hooks/use-toast";
import { getWalletCompetenciesApi } from "@/services/api/wallet.api";
import { SsiIdentityCard } from "@/components/wallet/SsiIdentityCard";
import { LearnerCredentialWallet } from "@/components/wallet/LearnerCredentialWallet";
import { SignedPresentationCard } from "@/components/wallet/SignedPresentationCard";
import { WalletDashboardHub } from "@/components/wallet/WalletDashboardHub";
import { VerifiedProofFlow } from "@/components/wallet/VerifiedProofFlow";
import { WalletRefreshBar } from "@/components/wallet/WalletWorkspacePanels";

export default function WalletPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const panelParam = searchParams.get("panel");
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useLearnerProfile();
  const { credentials, loading: credentialsLoading, refresh: refreshCredentials } = useCredentials();
  const [walletPanel, setWalletPanel] = useState<"hub" | "achievements" | "share" | "manage" | "proof">(
    panelParam === "share" || panelParam === "achievements" || panelParam === "manage" || panelParam === "proof"
      ? panelParam
      : "hub",
  );
  const [records, setRecords] = useState<WalletCompetencyRecordView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (panelParam === "share" || panelParam === "achievements" || panelParam === "manage" || panelParam === "proof") {
      setWalletPanel(panelParam);
    }
  }, [panelParam]);

  const openWalletHub = () => {
    setWalletPanel("hub");
    if (searchParams.has("panel")) {
      const next = new URLSearchParams(searchParams);
      next.delete("panel");
      setSearchParams(next, { replace: true });
    }
  };

  const openCompetency = (skill: string) => {
    const target = skill.trim().toLowerCase();
    const match = records.find((record) => {
      const name = record.competencyName.trim().toLowerCase();
      return name === target || name.includes(target) || target.includes(name);
    });
    if (match) {
      navigate(`/learner/wallet/competency/${encodeURIComponent(match.competencyId)}`);
      return;
    }
    if (records[0]) {
      navigate(`/learner/wallet/competency/${encodeURIComponent(records[0].competencyId)}`);
      return;
    }
    toast({
      title: "Competency not linked",
      description: "No matching learning record was found for this achievement.",
    });
  };

  const loadRecords = async () => {
    if (!user?.id) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [derivedRecords, apiRecords] = await Promise.all([
        fetchWalletCompetencyRecords(user.id),
        getWalletCompetenciesApi(),
      ]);
      const derivedById = new Map(derivedRecords.map((record) => [record.competencyId, record]));
      const merged = apiRecords?.length
        ? [
            ...apiRecords.map((record) => derivedById.get(record.competencyId) ?? record),
            ...derivedRecords.filter((record) => !apiRecords.some((item) => item.competencyId === record.competencyId)),
          ]
        : derivedRecords;
      setRecords(merged);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords();
  }, [user?.id]);

  if (profileLoading || loading) {
    return (
      <LearnerWorkspaceShell variant="dashboard">
        <PageSkeleton rows={6} />
      </LearnerWorkspaceShell>
    );
  }

  return (
    <LearnerWorkspaceShell variant="dashboard">
      <WalletRefreshBar onRefresh={() => void loadRecords()} loading={loading} />
      {walletPanel === "hub" ? (
        <WalletDashboardHub
          credentials={credentials.map((credential) => ({ id: credential.id, name: credential.skill || credential.name }))}
          credentialsLoading={credentialsLoading}
          onViewAchievements={() => setWalletPanel("achievements")}
          onShare={() => setWalletPanel("share")}
          onManage={() => setWalletPanel("manage")}
          onGetProof={() => setWalletPanel("proof")}
          onCredentialClick={(name) => openCompetency(name)}
        />
      ) : (
        <section className="space-y-4" aria-label="Secure wallet">
          {walletPanel !== "proof" && walletPanel !== "share" ? (
            <button type="button" className="text-sm font-semibold text-[#023E8A]" onClick={openWalletHub}>
              Back to My Secure Wallet
            </button>
          ) : null}
          {walletPanel === "achievements" && user ? (
            <LearnerCredentialWallet
              userId={user.id}
              credentials={credentials}
              onOpenSkill={(skill) => openCompetency(skill)}
            />
          ) : null}
          {walletPanel === "share" ? <SignedPresentationCard onBack={openWalletHub} /> : null}
          {walletPanel === "manage" ? <SsiIdentityCard /> : null}
          {walletPanel === "proof" && user ? (
            <VerifiedProofFlow
              userId={user.id}
              credentials={credentials}
              learnerName={profile?.name ?? null}
              onBack={openWalletHub}
              onViewInWallet={() => setWalletPanel("achievements")}
              onIssued={() => void refreshCredentials()}
            />
          ) : null}
        </section>
      )}
    </LearnerWorkspaceShell>
  );
}
