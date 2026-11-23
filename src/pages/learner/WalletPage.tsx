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
  const [walletPanel, setWalletPanel] = useState<"hub" | "share" | "manage" | "proof">(
    panelParam === "share" || panelParam === "manage" || panelParam === "proof"
      ? panelParam
      : "hub",
  );
  const [records, setRecords] = useState<WalletCompetencyRecordView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (panelParam === "share" || panelParam === "manage" || panelParam === "proof") {
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

  const openCompetencyById = (skillId: string) => {
    navigate("/learner/wallet/competency/" + encodeURIComponent(skillId));
  };

  const openCompetency = (skill: string) => {
    const target = skill.trim().toLowerCase();
    const match = records.find((record) => {
      const name = record.competencyName.trim().toLowerCase();
      return name === target;
    });
    if (match) {
      openCompetencyById(match.competencyId);
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
      {walletPanel !== "manage" ? <WalletRefreshBar onRefresh={() => void loadRecords()} loading={loading} /> : null}
      {walletPanel === "hub" ? (
        <WalletDashboardHub
          credentials={credentials.map((credential) => ({ id: credential.id, name: credential.skill || credential.name }))}
          credentialsLoading={credentialsLoading}
          onShare={() => setWalletPanel("share")}
          onManage={() => setWalletPanel("manage")}
          onGetProof={() => setWalletPanel("proof")}
          onCredentialClick={(name) => openCompetency(name)}
        />
      ) : (
        <section className="space-y-4" aria-label="Secure wallet">
          {walletPanel === "share" ? <SignedPresentationCard onBack={openWalletHub} /> : null}
          {walletPanel === "manage" ? <SsiIdentityCard onBack={openWalletHub} /> : null}
          {walletPanel === "proof" && user ? (
            <VerifiedProofFlow
              userId={user.id}
              credentials={credentials}
              learnerName={profile?.name ?? null}
              onBack={openWalletHub}
              onViewInWallet={openCompetencyById}
              onIssued={() => void refreshCredentials()}
            />
          ) : null}
        </section>
      )}
    </LearnerWorkspaceShell>
  );
}
