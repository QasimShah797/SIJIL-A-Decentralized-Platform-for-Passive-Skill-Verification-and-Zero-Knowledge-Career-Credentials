import { useEffect, useMemo, useState } from "react";
import { Copy, Link2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { toast } from "@/hooks/use-toast";
import type { WalletCompetencyRecordView } from "@/lib/db/wallet-competency-records";
import type {
  WalletShareFieldId,
  WalletShareSelectionMode,
} from "@/lib/wallet-competency-shared";
import {
  getWalletCompetencyApi,
  revokeWalletShareApi,
  shareWalletCompetencyApi,
  syncWalletCompetencyApi,
  type ShareWalletCompetencyResult,
  type WalletCompetencyDetailView,
} from "@/services/api/wallet.api";

const SHARE_FIELD_OPTIONS: Array<{
  id: WalletShareFieldId;
  label: string;
  description: string;
}> = [
  { id: "competency_name", label: "Competency name", description: "Share the declared competency name." },
  { id: "competency_domain", label: "Competency domain", description: "Share the competency category or domain." },
  { id: "competency_description", label: "Competency description", description: "Share the learner-provided competency description." },
  { id: "verification_status", label: "Verification status", description: "Share SIJIL's current competency verification summary." },
  { id: "practical_task_result", label: "Practical task result", description: "Share the latest practical task status and score summary." },
  { id: "github_evidence", label: "GitHub evidence", description: "Share linked repositories, activities, and GitHub review evidence." },
  { id: "lms_evidence", label: "LMS evidence", description: "Share Moodle or LMS coursework, assignments, and grades." },
  { id: "peer_reviews", label: "Peer reviews", description: "Share peer review comments and related review metadata." },
  { id: "teacher_feedback", label: "Teacher feedback", description: "Share teacher or Moodle feedback when available." },
  { id: "complete_evidence_package", label: "Complete evidence package", description: "Share the structured competency evidence package only." },
  { id: "learner_did", label: "Learner DID", description: "Share the wallet holder DID." },
  { id: "timestamps", label: "Timestamps", description: "Share evidence collection and update timestamps." },
  { id: "credential_metadata", label: "Credential metadata", description: "Share any linked credential metadata already stored in SIJIL." },
];

const PRESETS: Array<{
  mode: WalletShareSelectionMode;
  label: string;
  fields: WalletShareFieldId[];
}> = [
  {
    mode: "basic_summary",
    label: "Share Basic Summary",
    fields: ["competency_name", "competency_domain"],
  },
  {
    mode: "verification_summary",
    label: "Share Verification Summary",
    fields: [
      "competency_name",
      "competency_domain",
      "verification_status",
      "practical_task_result",
      "timestamps",
    ],
  },
  {
    mode: "complete_evidence_package",
    label: "Share Complete Evidence Package",
    fields: [
      "competency_name",
      "competency_domain",
      "competency_description",
      "verification_status",
      "practical_task_result",
      "github_evidence",
      "lms_evidence",
      "peer_reviews",
      "teacher_feedback",
      "complete_evidence_package",
      "timestamps",
      "credential_metadata",
    ],
  },
];

function shareStatusVariant(status: "Active" | "Expired" | "Revoked"): "verified" | "warning" | "destructive" {
  if (status === "Active") return "verified";
  if (status === "Expired") return "warning";
  return "destructive";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Recent";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  return date.toLocaleString();
}

function toggleField(fields: WalletShareFieldId[], fieldId: WalletShareFieldId): WalletShareFieldId[] {
  return fields.includes(fieldId)
    ? fields.filter((item) => item !== fieldId)
    : [...fields, fieldId];
}

function buildPreview(record: WalletCompetencyRecordView, selectedFields: WalletShareFieldId[]) {
  const previews: Array<{ label: string; value: string }> = [];
  if (selectedFields.includes("competency_name")) {
    previews.push({ label: "Competency", value: record.competencyName });
  }
  if (selectedFields.includes("competency_domain")) {
    previews.push({ label: "Domain", value: record.domain });
  }
  if (selectedFields.includes("competency_description") && record.description) {
    previews.push({ label: "Description", value: record.description });
  }
  if (selectedFields.includes("verification_status")) {
    previews.push({ label: "Verification", value: record.verificationStatus ?? "Unverified" });
  }
  if (selectedFields.includes("practical_task_result")) {
    previews.push({ label: "Task result", value: record.taskResult ?? "Submitted" });
  }
  if (selectedFields.includes("github_evidence")) {
    const count =
      record.evidencePackage.github.repos.length
      + record.evidencePackage.github.activities.length
      + record.evidencePackage.github.evidenceRecords.length
      + record.evidencePackage.github.reviews.length;
    previews.push({ label: "GitHub evidence", value: `${count} item(s)` });
  }
  if (selectedFields.includes("lms_evidence")) {
    const count =
      record.evidencePackage.lms.evidence.length
      + record.evidencePackage.lms.courses.length
      + record.evidencePackage.lms.assignments.length
      + record.evidencePackage.lms.grades.length
      + record.evidencePackage.lms.importedEvidence.length;
    previews.push({ label: "LMS evidence", value: `${count} item(s)` });
  }
  if (selectedFields.includes("peer_reviews")) {
    previews.push({ label: "Peer reviews", value: `${record.evidencePackage.peerReviews.length} item(s)` });
  }
  if (selectedFields.includes("teacher_feedback")) {
    previews.push({ label: "Teacher feedback", value: `${record.evidencePackage.teacherFeedback.length} item(s)` });
  }
  if (selectedFields.includes("complete_evidence_package")) {
    previews.push({ label: "Evidence package", value: `${record.evidenceCount} total evidence item(s)` });
  }
  if (selectedFields.includes("learner_did") && record.learnerDid) {
    previews.push({ label: "Learner DID", value: record.learnerDid });
  }
  if (selectedFields.includes("timestamps")) {
    previews.push({ label: "Last updated", value: formatDate(record.updatedAt) });
  }
  if (selectedFields.includes("credential_metadata")) {
    previews.push({
      label: "Credential metadata",
      value: `${record.evidencePackage.credentialMetadata?.length ?? 0} item(s)`,
    });
  }
  return previews;
}

export function CompetencyShareDialog({
  record,
  open,
  onOpenChange,
  onRecordSynced,
}: {
  record: WalletCompetencyRecordView | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onRecordSynced?: (record: WalletCompetencyRecordView) => void;
}) {
  const [detail, setDetail] = useState<WalletCompetencyDetailView | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFields, setSelectedFields] = useState<WalletShareFieldId[]>([]);
  const [selectionMode, setSelectionMode] = useState<WalletShareSelectionMode>("custom");
  const [createdShare, setCreatedShare] = useState<ShareWalletCompetencyResult | null>(null);

  useEffect(() => {
    if (!open || !record) return;
    let active = true;
    setLoading(true);
    setCreatedShare(null);
    setSelectedFields([]);
    setSelectionMode("custom");

    getWalletCompetencyApi(record.competencyId)
      .then((next) => {
        if (!active || !next) return;
        setDetail(next);
        onRecordSynced?.(next.record);
      })
      .catch((error: unknown) => {
        if (!active) return;
        toast({
          title: "Could not load share details",
          description: error instanceof Error ? error.message : "Wallet share API failed.",
          variant: "destructive",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, record?.competencyId]);

  const activeRecord = detail?.record ?? record;

  const preview = useMemo(
    () => (activeRecord ? buildPreview(activeRecord, selectedFields) : []),
    [activeRecord, selectedFields],
  );

  const applyPreset = (mode: WalletShareSelectionMode, fields: WalletShareFieldId[]) => {
    setSelectionMode(mode);
    setSelectedFields(fields);
  };

  const handleSync = async () => {
    if (!record) return;
    setSubmitting(true);
    try {
      const next = await syncWalletCompetencyApi(record.competencyId);
      if (next) {
        setDetail((current) => current ? { ...current, record: next } : { record: next, shares: [] });
        onRecordSynced?.(next);
        toast({ title: "Wallet record synced" });
      }
    } catch (error) {
      toast({
        title: "Could not sync wallet record",
        description: error instanceof Error ? error.message : "Sync failed.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleShare = async () => {
    if (!record || selectedFields.length === 0) return;
    setSubmitting(true);
    try {
      const result = await shareWalletCompetencyApi({
        competencyId: record.competencyId,
        selectionMode,
        selectedFields,
        expiresInDays: 30,
      });
      setCreatedShare(result);

      const nextDetail = await getWalletCompetencyApi(record.competencyId);
      if (nextDetail) {
        setDetail(nextDetail);
        onRecordSynced?.(nextDetail.record);
      }

      toast({
        title: "Share link created",
        description: "This is a signed selective disclosure presentation, not a zero-knowledge proof.",
      });
    } catch (error) {
      toast({
        title: "Could not create share link",
        description: error instanceof Error ? error.message : "Share generation failed.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (shareId: string) => {
    setSubmitting(true);
    try {
      const ok = await revokeWalletShareApi(shareId);
      if (!ok) throw new Error("Presentation revocation failed.");
      setDetail((current) => current
        ? {
            ...current,
            shares: current.shares.map((share) => (
              share.id === shareId
                ? {
                    ...share,
                    shareStatus: "Revoked",
                    revokedAt: new Date().toISOString(),
                  }
                : share
            )),
          }
        : current);
      toast({ title: "Share link revoked" });
    } catch (error) {
      toast({
        title: "Could not revoke share link",
        description: error instanceof Error ? error.message : "Revoke failed.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!record || !activeRecord) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden">
        <DialogHeader className="pr-8">
          <DialogTitle>Share with Recruiter</DialogTitle>
          <DialogDescription>
            Create a signed selective disclosure presentation for {activeRecord.competencyName}. Nothing is shared by default.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 overflow-y-auto pr-2 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Quick options</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <Button
                    key={preset.mode}
                    type="button"
                    variant={selectionMode === preset.mode ? "default" : "outline"}
                    onClick={() => applyPreset(preset.mode, preset.fields)}
                  >
                    {preset.label}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant={selectionMode === "custom" ? "default" : "outline"}
                  onClick={() => setSelectionMode("custom")}
                >
                  Custom Selection
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Disclosure options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {SHARE_FIELD_OPTIONS.map((field) => (
                  <label
                    key={field.id}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 p-3"
                  >
                    <Checkbox
                      checked={selectedFields.includes(field.id)}
                      onCheckedChange={() => {
                        setSelectionMode("custom");
                        setSelectedFields((current) => toggleField(current, field.id));
                      }}
                    />
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{field.label}</div>
                      <div className="text-xs text-muted-foreground">{field.description}</div>
                    </div>
                  </label>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Active and past share links</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <div className="text-sm text-muted-foreground">Loading share history…</div>
                ) : (detail?.shares.length ?? 0) === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No recruiter share links have been created for this competency yet.
                  </div>
                ) : (
                  detail?.shares.map((share) => (
                    <div key={share.id} className="rounded-xl border border-border/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">{share.selectionMode.replaceAll("_", " ")}</div>
                          <div className="text-xs text-muted-foreground">
                            Created {formatDate(share.createdAt)} · Expires {formatDate(share.expiresAt)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge variant={shareStatusVariant(share.shareStatus)}>
                            {share.shareStatus}
                          </StatusBadge>
                          {share.shareStatus === "Active" && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void handleRevoke(share.id)}
                              disabled={submitting}
                            >
                              Revoke Link
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Privacy notice</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>Only selected attributes are sent to the recruiter.</p>
                <p>Hidden fields are omitted server-side and never included in the share payload.</p>
                <p>This generates a signed verifiable presentation, not a cryptographic zero-knowledge proof.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {preview.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    Select one or more fields to preview the disclosure package.
                  </div>
                ) : (
                  preview.map((item) => (
                    <div key={item.label} className="rounded-xl border border-border/60 p-3">
                      <div className="text-[11px] text-muted-foreground">{item.label}</div>
                      <div className="mt-1 break-all text-sm font-medium">{item.value}</div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {createdShare && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Generated share link</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-xl border border-border/60 p-3">
                    <div className="text-[11px] text-muted-foreground">Share URL</div>
                    <div className="mt-1 break-all text-sm font-medium">{createdShare.shareUrl}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(createdShare.shareUrl);
                        toast({ title: "Share link copied" });
                      }}
                    >
                      <Copy className="mr-1.5 h-4 w-4" />
                      Copy Link
                    </Button>
                    <StatusBadge variant="verified">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {createdShare.proofType}
                    </StatusBadge>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSync()}
                disabled={submitting}
              >
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Sync Wallet Record
              </Button>
              <Button
                type="button"
                onClick={() => void handleShare()}
                disabled={submitting || selectedFields.length === 0}
              >
                <Link2 className="mr-1.5 h-4 w-4" />
                Generate Share Link
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
