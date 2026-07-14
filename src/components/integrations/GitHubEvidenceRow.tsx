import { useEffect, useRef, useState } from "react";
import { ExternalLink, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { toast } from "@/hooks/use-toast";
import type { ProjectEvidenceApiView } from "@/lib/db/github-evidence";
import {
  getEvidenceReviewsApi,
  getEligibleReviewersApi,
  createReviewRequestApi,
  importExternalReviewsApi,
  canRequestContextReview,
  type EvidenceReviewSummary,
  type EligibleReviewerView,
} from "@/services/api/reviews.api";
import { isApiEnabled } from "@/services/api/client";
import { cn } from "@/lib/utils";

function isProjectLinked(project: ProjectEvidenceApiView): boolean {
  return project.skillLinks.length > 0;
}

export type GitHubEvidenceRowProps = {
  project: ProjectEvidenceApiView;
  declaredSkills: { id: string; name: string }[];
  onLinkSkill: (repoId: string, skillId: string | null, skillName: string | null) => void;
  onOpenSkill: (skillId: string) => void;
  reviewStatusVariant: (status: string) => "verified" | "neutral" | "info" | "destructive";
};

export function GitHubEvidenceRow({
  project,
  declaredSkills,
  onLinkSkill,
  onOpenSkill,
  reviewStatusVariant,
}: GitHubEvidenceRowProps) {
  const linked = isProjectLinked(project);
  const primaryLink = project.skillLinks[0];
  const selectRef = useRef<HTMLSelectElement>(null);

  const [reviewSummary, setReviewSummary] = useState<EvidenceReviewSummary | null>(null);
  const [eligibleReviewers, setEligibleReviewers] = useState<EligibleReviewerView[]>([]);
  const [requestOpen, setRequestOpen] = useState(false);
  const [selectedReviewerId, setSelectedReviewerId] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!isApiEnabled() || !project.evidenceRecordId || !linked) return;
    (async () => {
      await importExternalReviewsApi(
        project.evidenceRecordId
          ? { evidenceId: project.evidenceRecordId, projectId: project.id }
          : { projectId: project.id },
      );
      const summary = await getEvidenceReviewsApi(project.evidenceRecordId);
      setReviewSummary(summary);
    })();
  }, [project.evidenceRecordId, project.id, linked]);

  const loadEligibleReviewers = async () => {
    if (!project.evidenceRecordId) return;
    const list = await getEligibleReviewersApi(project.evidenceRecordId);
    setEligibleReviewers(list ?? []);
    if (list?.length === 1) {
      setSelectedReviewerId(list[0].id);
      setReviewerEmail(list[0].email ?? "");
    }
  };

  const handleRequestReview = async () => {
    if (!primaryLink || !project.evidenceRecordId || !selectedReviewerId || !reviewerEmail.trim()) {
      toast({ title: "Missing details", description: "Select a reviewer and enter their email." });
      return;
    }
    setRequesting(true);
    try {
      const result = await createReviewRequestApi({
        evidenceId: project.evidenceRecordId,
        skillId: primaryLink.skillId,
        reviewerContextId: selectedReviewerId,
        reviewerEmail: reviewerEmail.trim(),
      });
      if (!result) throw new Error("Review request failed");
      toast({
        title: "Review request sent",
        description: `Awaiting feedback from ${reviewerEmail.trim()}. Link: ${result.reviewLink}`,
      });
      setRequestOpen(false);
      const updated = await getEvidenceReviewsApi(project.evidenceRecordId);
      setReviewSummary(updated);
    } catch (e) {
      toast({
        title: "Could not send request",
        description: e instanceof Error ? e.message : "Try again later",
        variant: "destructive",
      });
    } finally {
      setRequesting(false);
    }
  };

  const languageLabel = project.primaryLanguage ?? "—";
  const commitLabel =
    typeof project.commitCount === "number" ? `${project.commitCount} commits` : "—";

  return (
    <div className="group hover:bg-muted/30 transition-colors">
      <div
        className={cn(
          "px-4 py-4 md:py-3.5",
          "md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,0.75fr)_minmax(0,0.75fr)_minmax(0,1fr)_minmax(0,0.75fr)_48px] md:gap-3 md:items-center",
        )}
      >
        {/* Repository */}
        <div className="min-w-0 mb-3 md:mb-0">
          <div className="flex items-center gap-1 min-w-0">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={project.repositoryUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-sm truncate hover:underline text-foreground"
                  >
                    {project.repositoryName}
                  </a>
                </TooltipTrigger>
                <TooltipContent>{project.repositoryName}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <a
              href={project.repositoryUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={`Open ${project.repositoryName} on GitHub`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{project.repoFullName}</p>
          <div className="mt-2 flex flex-wrap gap-2 md:hidden">
            <StatusBadge variant="neutral" className="text-[11px]">
              {languageLabel}
            </StatusBadge>
            <span className="text-xs text-muted-foreground">{commitLabel}</span>
          </div>
        </div>

        {/* Language — desktop */}
        <div className="hidden md:block">
          <StatusBadge variant="neutral">{languageLabel}</StatusBadge>
        </div>

        {/* Commits — desktop */}
        <div className="hidden md:block text-sm text-muted-foreground">{commitLabel}</div>

        {/* Linked competency */}
        <div className="mb-3 md:mb-0">
          <p className="text-xs text-muted-foreground mb-1 md:sr-only">Linked competency</p>
          {declaredSkills.length > 0 && primaryLink ? (
            <select
              ref={selectRef}
              className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
              defaultValue={primaryLink.skillId}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) onLinkSkill(project.repoId, null, null);
                else {
                  const skill = declaredSkills.find((s) => s.id === val);
                  if (skill) onLinkSkill(project.repoId, skill.id, skill.name);
                }
              }}
              aria-label={`Competency mapping for ${project.repositoryName}`}
            >
              <option value={primaryLink.skillId}>{primaryLink.skillName}</option>
              {declaredSkills
                .filter((s) => s.id !== primaryLink.skillId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — Link
                  </option>
                ))}
              <option value="">— Remove link —</option>
            </select>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 mb-3 md:mb-0">
          <StatusBadge variant={linked ? "verified" : "neutral"}>
            {linked ? "Project Evidence" : "Unlinked"}
          </StatusBadge>
          {reviewSummary && linked && (
            <StatusBadge variant={reviewStatusVariant(reviewSummary.displayStatus)} className="hidden lg:inline-flex">
              {reviewSummary.displayStatus}
            </StatusBadge>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end md:justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-9 w-9 px-0"
                aria-label={`Actions for ${project.repositoryName}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {primaryLink && (
                <DropdownMenuItem onClick={() => onOpenSkill(primaryLink.skillId)}>
                  View validation trail
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <a href={project.repositoryUrl} target="_blank" rel="noreferrer">
                  Open repository
                </a>
              </DropdownMenuItem>
              {primaryLink && (
                <DropdownMenuItem onClick={() => selectRef.current?.focus()}>
                  Change competency mapping
                </DropdownMenuItem>
              )}
              {reviewSummary && canRequestContextReview(reviewSummary) && primaryLink && (
                <DropdownMenuItem
                  onClick={() => {
                    setRequestOpen(true);
                    void loadEligibleReviewers();
                  }}
                >
                  Request context review
                </DropdownMenuItem>
              )}
              {primaryLink && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onLinkSkill(project.repoId, null, null)}
                  >
                    Remove skill link
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {reviewSummary && linked && (
        <div className="px-4 pb-3 md:pb-2.5 -mt-1 md:col-span-full">
          <div className="lg:hidden mb-2">
            <StatusBadge variant={reviewStatusVariant(reviewSummary.displayStatus)}>
              {reviewSummary.displayStatus}
            </StatusBadge>
          </div>
          {reviewSummary.reviews.slice(0, 1).map((r) => (
            <p key={r.id} className="text-xs text-muted-foreground line-clamp-2">
              {r.reviewerName}: {r.comment}
            </p>
          ))}
        </div>
      )}

      {requestOpen && primaryLink && (
        <div className="px-4 pb-4 border-t bg-muted/20 pt-3 space-y-2">
          {eligibleReviewers.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No eligible context-linked reviewers found yet. Sync GitHub to refresh contributors.
            </p>
          ) : (
            <>
              <select
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={selectedReviewerId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedReviewerId(id);
                  const rev = eligibleReviewers.find((r) => r.id === id);
                  if (rev?.email) setReviewerEmail(rev.email);
                }}
              >
                <option value="">Select reviewer…</option>
                {eligibleReviewers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.contextRole}
                  </option>
                ))}
              </select>
              <Input
                type="email"
                placeholder="Reviewer email"
                className="h-8 text-xs"
                value={reviewerEmail}
                onChange={(e) => setReviewerEmail(e.target.value)}
              />
            </>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs flex-1"
              disabled={requesting || eligibleReviewers.length === 0}
              onClick={() => void handleRequestReview()}
            >
              {requesting ? "Sending…" : "Send request"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setRequestOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
