import { useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { useCredentials } from "@/hooks/useLearnerData";
import type { CredentialView } from "@/lib/db/credentials";
import type { WalletShareFieldId } from "@/lib/wallet-competency-shared";
import {
  getWalletCompetenciesApi,
  listOwnerSharesApi,
  revokeWalletShareApi,
  shareWalletCompetencyApi,
  type OwnerShareSummary,
} from "@/services/api/wallet.api";
import { walletShareRequest } from "@/lib/sharing/guide";
import { apiRequest } from "@/services/api/client";
import { GuidedShareFlow, type ManagedShare } from "./GuidedShareFlow";

function toManagedShare(row: OwnerShareSummary): ManagedShare {
  const status = row.shareStatus === "Revoked" ? "revoked" : row.shareStatus === "Expired" ? "expired" : "active";
  const detail = row.shareKind === "direct-recruiter"
    ? [row.recipientName, row.recipientOrganization].filter(Boolean).join(" at ")
    : row.expiresAt
      ? `Until ${new Date(row.expiresAt).toLocaleDateString()}`
      : "";
  return {
    id: row.id,
    label: row.label,
    kind: row.shareKind === "all-recruiters" ? "all-recruiters" : row.shareKind === "direct-recruiter" ? "direct" : "public",
    detail,
    status,
    sharedAt: row.createdAt,
  };
}

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
  const [managedShares, setManagedShares] = useState<ManagedShare[]>([]);

  const loadShares = async () => {
    try {
      const rows = await listOwnerSharesApi();
      setManagedShares(rows.map(toManagedShare));
    } catch {
      setManagedShares([]);
    }
  };

  useEffect(() => {
    void loadShares();
  }, []);

  const shareSelected = async (
    chosenIds: string[],
    selectedFields: string[],
    extra: { recipientUserId?: string; shareAudience?: "all-recruiters"; consentToAllRecruiters?: boolean },
  ) => {
    const rows = await getWalletCompetenciesApi();
    if (!rows) {
      throw new Error("The wallet service is unavailable. Start the SIJIL API and try again.");
    }
    const versionResult = await apiRequest<{ versions: Array<{ id: string; credentialId: string | null; status: string }> }>("/wallet/competency-versions").catch(() => null);
    const versionIds = (versionResult?.versions ?? [])
      .filter((version) => version.status === "issued" && version.credentialId && chosenIds.includes(version.credentialId))
      .map((version) => version.id);
    const chosen = credentials.filter((credential) => chosenIds.includes(credential.id));
    if (chosen.length === 0) throw new Error("Select at least one achievement.");
    let recipientName: string | null = null;
    let recipientOrganization: string | null = null;
    for (const credential of chosen) {
      const skill = credential.skill !== "—" ? credential.skill : credential.name;
      const wanted = skill.trim().toLowerCase();
      const matches = rows.filter((row) => row.competencyName.trim().toLowerCase() === wanted);
      if (matches.length !== 1) {
        throw new Error(`${skill} is not available to share from the wallet yet.`);
      }
      const request = walletShareRequest({
        competencyId: matches[0].competencyId,
        selectedFields,
        expiresInDays: 30,
      });
      const created = await shareWalletCompetencyApi({
        ...request,
        selectedFields: request.selectedFields as WalletShareFieldId[],
        ...extra,
        ...(versionIds.length > 0 ? { competencyVersionIds: versionIds } : {}),
      });
      recipientName = created.recipientName ?? recipientName;
      recipientOrganization = created.recipientOrganization ?? recipientOrganization;
    }
    await loadShares();
    return { recipientName, recipientOrganization };
  };

  const shareWithAllRecruiters = async (input: { credentialIds: string[]; selectedFields: string[] }) => {
    await shareSelected(input.credentialIds, input.selectedFields, {
      shareAudience: "all-recruiters",
      consentToAllRecruiters: true,
    });
    toast({ title: "Visible to all SIJIL recruiters" });
  };

  const revokeManagedShare = async (shareId: string) => {
    const confirmed = window.confirm(
      "Stop this share? Recruiters will lose access the next time they open SIJIL. A copy they already saved is not deleted.",
    );
    if (!confirmed) return;
    const stopped = await revokeWalletShareApi(shareId);
    if (!stopped) throw new Error("The share could not be stopped.");
    toast({ title: "Sharing stopped" });
    await loadShares();
  };

  return (
    <GuidedShareFlow
      credentials={credentials.map((credential) => ({
        id: credential.id,
        title: credential.skill !== "—" ? credential.skill : credential.name,
        issuer: credential.issuer || credential.issuerDid,
        status: statusLabel(credential),
      }))}
      onBack={onBack}
      onShareAll={shareWithAllRecruiters}
      managedShares={managedShares}
      onRevokeManagedShare={revokeManagedShare}
    />
  );
}
