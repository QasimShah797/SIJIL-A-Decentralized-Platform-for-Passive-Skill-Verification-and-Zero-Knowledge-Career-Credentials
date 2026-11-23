import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { useCredentials, useLearnerProfile } from "@/hooks/useLearnerData";
import type { CredentialView } from "@/lib/db/credentials";
import type { WalletShareFieldId } from "@/lib/wallet-competency-shared";
import {
  assessEvidenceShareAvailability,
  findUniqueWalletSkill,
} from "@/lib/evidence-share-availability";
import {
  emailPublicShareApi,
  getWalletCompetenciesApi,
  revokeWalletShareApi,
  shareWalletCompetencyApi,
} from "@/services/api/wallet.api";
import type { WalletCompetencyRecordView } from "@/lib/db/wallet-competency-records";
import { walletShareRequest } from "@/lib/sharing/guide";
import { apiRequest } from "@/services/api/client";
import { GuidedShareFlow } from "./GuidedShareFlow";

function statusLabel(credential: CredentialView): string {
  if (credential.ledgerAnchorStatus === "anchored" || credential.anchorStatus === "anchored") {
    return "Anchored";
  }
  if (credential.verification === "verified" || credential.attestation === "attested") {
    return "Confirmed";
  }
  return credential.verification || credential.attestation || "Issued";
}

export function SignedPresentationCard({ onBack }: { onBack: () => void }) {
  const { credentials } = useCredentials();
  const { profile } = useLearnerProfile();
  const [walletRows, setWalletRows] = useState<WalletCompetencyRecordView[] | null>(null);

  const [evidenceStatus, setEvidenceStatus] = useState<"loading" | "ready" | "error">("loading");
  const requestVersion = useRef(0);
  const refreshEvidence = useCallback(async (background = false) => {
    const version = ++requestVersion.current;
    if (!background) setEvidenceStatus("loading");
    try {
      const rows = await getWalletCompetenciesApi();
      if (version !== requestVersion.current) return;
      setWalletRows(rows);
      setEvidenceStatus(rows ? "ready" : "error");
    } catch {
      if (version === requestVersion.current) setEvidenceStatus("error");
    }
  }, []);

  useEffect(() => {
    void refreshEvidence();
    const refreshOnFocus = () => { void refreshEvidence(); };
    window.addEventListener("focus", refreshOnFocus);
    const poll = window.setInterval(() => {
      if (!document.hidden) void refreshEvidence(true);
    }, 30_000);
    return () => {
      requestVersion.current++;
      window.clearInterval(poll);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [refreshEvidence]);

  const shareCredentials = useMemo(() => credentials.map((credential) => {
    const title = credential.skill !== "—" ? credential.skill : credential.name;
    const record = findUniqueWalletSkill(walletRows ?? [], title);
    return {
      id: credential.id,
      title,
      issuer: credential.issuer || "SIJIL",
      status: statusLabel(credential),
      issuedAt: credential.validFrom,
      evidenceAvailability: assessEvidenceShareAvailability(record?.evidencePackage),
    };
  }), [credentials, walletRows]);

  const shareSelected = async (
    chosenIds: string[],
    selectedFields: string[],
    extra: {
      recipientUserId?: string;
      shareAudience?: "all-recruiters";
      consentToAllRecruiters?: boolean;
      evidenceModesByCredential: Record<string, import("@/services/api/wallet.api").ShareEvidenceModes>;
    },
  ) => {
    const rows = await getWalletCompetenciesApi();
    if (!rows) {
      throw new Error("The wallet service is unavailable. Start the SIJIL API and try again.");
    }
    const versionResult = await apiRequest<{ versions: Array<{ id: string; credentialId: string | null; status: string }> }>("/wallet/competency-versions").catch(() => null);
    const chosen = credentials.filter((credential) => chosenIds.includes(credential.id));
    if (chosen.length === 0) throw new Error("Select at least one achievement.");
    let recipientName: string | null = null;
    let recipientOrganization: string | null = null;
    for (const credential of chosen) {
      const skill = credential.skill !== "—" ? credential.skill : credential.name;
      const record = findUniqueWalletSkill(rows, skill);
      if (!record) {
        throw new Error(`${skill} is not available to share from the wallet yet.`);
      }
      const request = walletShareRequest({
        competencyId: record.competencyId,
        selectedFields: [...selectedFields, ...Object.entries(extra.evidenceModesByCredential[credential.id] ?? {})
          .filter(([, mode]) => mode !== "omit").map(([field]) => field)],
        expiresInDays: 30,
      });
      const versionIds = (versionResult?.versions ?? [])
        .filter((version) => version.status === "issued" && version.credentialId === credential.id)
        .map((version) => version.id);
      const created = await shareWalletCompetencyApi({
        ...request,
        selectedFields: request.selectedFields as WalletShareFieldId[],
        evidenceModes: extra.evidenceModesByCredential[credential.id],
        shareAudience: extra.shareAudience,
        consentToAllRecruiters: extra.consentToAllRecruiters,
        recipientUserId: extra.recipientUserId,
        credentialId: credential.id,
        ...(versionIds.length > 0 ? { competencyVersionIds: versionIds } : {}),
      });
      recipientName = created.recipientName ?? recipientName;
      recipientOrganization = created.recipientOrganization ?? recipientOrganization;
    }
    return { recipientName, recipientOrganization };
  };

  const shareWithAllRecruiters = async (input: {
    credentialIds: string[];
    selectedFields: string[];
    evidenceModesByCredential: Record<string, import("@/services/api/wallet.api").ShareEvidenceModes>;
  }) => {
    await shareSelected(input.credentialIds, input.selectedFields, {
      shareAudience: "all-recruiters",
      consentToAllRecruiters: true,
      evidenceModesByCredential: input.evidenceModesByCredential,
    });
    toast({ title: "Visible to all SIJIL recruiters" });
  };

  const createPublicLink = async (input: {
    credentialId: string;
    selectedFields: string[];
    evidenceModes: import("@/services/api/wallet.api").ShareEvidenceModes;
    expiresInDays: number;
  }) => {
    const rows = await getWalletCompetenciesApi();
    if (!rows) {
      throw new Error("The wallet service is unavailable. Start the SIJIL API and try again.");
    }
    const credential = credentials.find((item) => item.id === input.credentialId);
    if (!credential) throw new Error("Select an issued credential.");
    const skill = credential.skill !== "—" ? credential.skill : credential.name;
    const record = findUniqueWalletSkill(rows, skill);
    if (!record) {
      throw new Error(`${skill} is not available to share from the wallet yet.`);
    }
    const request = walletShareRequest({
      competencyId: record.competencyId,
      selectedFields: input.selectedFields,
      expiresInDays: input.expiresInDays,
    });
    const created = await shareWalletCompetencyApi({
      ...request,
      selectedFields: request.selectedFields as WalletShareFieldId[],
      evidenceModes: input.evidenceModes,
      credentialId: credential.id,
    });
    try {
      sessionStorage.setItem(
        `sijil.share.${created.shareId}`,
        JSON.stringify({ token: created.token, url: created.shareUrl }),
      );
    } catch {
      // ignore quota / private-mode failures
    }
    toast({ title: "Public verification link created" });
    return {
      shareUrl: created.shareUrl,
      shareId: created.shareId,
      token: created.token,
      skillName: skill,
    };
  };

  const stopPublicLink = async (shareId: string) => {
    const confirmed = window.confirm(
      "Stop this share? Access ends the next time someone opens SIJIL or the public link. A copy they already saved is not deleted.",
    );
    if (!confirmed) return false;
    const stopped = await revokeWalletShareApi(shareId);
    if (!stopped) throw new Error("The share could not be stopped.");
    toast({ title: "Sharing stopped" });
    return true;
  };

  return (
    <GuidedShareFlow
      credentials={shareCredentials}
      learnerName={profile?.name || "Learner"}
      evidenceStatus={evidenceStatus}
      onRefreshEvidence={() => void refreshEvidence()}
      onBack={onBack}
      onShareAll={shareWithAllRecruiters}
      onCreatePublicLink={createPublicLink}
      onEmailPublicLink={async (input) => {
        await emailPublicShareApi(input);
      }}
      onStopPublicLink={stopPublicLink}
    />
  );
}
