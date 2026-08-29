import {
  Github,
  RefreshCw,
  Code2,
  Download,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardSkeleton } from "@/components/sijil/SkeletonLoader";
import type { ProjectEvidenceApiView } from "@/lib/db/github-evidence";
import { IntegrationEmptyState } from "./IntegrationEmptyState";
import { GitHubEvidenceRow } from "./GitHubEvidenceRow";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

export type LanguageFilter = "all" | "javascript" | "typescript" | "java" | "python" | "other";

export type GitHubEvidencePanelProps = {
  connected: boolean;
  loading: boolean;
  syncing: boolean;
  username?: string;
  lastSyncedAt?: string | null;
  linkedCount: number;
  projects: ProjectEvidenceApiView[];
  visibleProjects: ProjectEvidenceApiView[];
  declaredSkills: { id: string; name: string }[];
  repoSearch: string;
  onRepoSearchChange: (value: string) => void;
  languageFilter: LanguageFilter;
  onLanguageFilterChange: (value: LanguageFilter) => void;
  hasMoreRepos: boolean;
  showAllRepos: boolean;
  onShowMore: () => void;
  remainingCount: number;
  onConnect: () => void;
  onSync: () => void;
  connecting: boolean;
  onLinkSkill: (repoId: string, skillId: string | null, skillName: string | null) => void;
  onOpenSkill: (skillId: string) => void;
};

function reviewStatusVariant(status: string): "verified" | "neutral" | "info" | "destructive" {
  if (status === "Imported Context Review" || status === "Context Verified Review") return "verified";
  if (status === "Review Request Sent" || status === "Awaiting Feedback") return "info";
  return "neutral";
}

const languageFilters: { id: LanguageFilter; label: string }[] = [
  { id: "all", label: "All languages" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "java", label: "Java" },
  { id: "python", label: "Python" },
  { id: "other", label: "Other" },
];

export function GitHubEvidencePanel(props: GitHubEvidencePanelProps) {
  const {
    connected,
    loading,
    syncing,
    linkedCount,
    projects,
    visibleProjects,
    declaredSkills,
    repoSearch,
    onRepoSearchChange,
    languageFilter,
    onLanguageFilterChange,
    hasMoreRepos,
    showAllRepos,
    onShowMore,
    remainingCount,
    onConnect,
    onSync,
    connecting,
    onLinkSkill,
    onOpenSkill,
  } = props;

  const handleExport = () => {
    toast({ title: "Export coming soon", description: "GitHub evidence export will be available in a future release." });
  };

  return (
    <div className="learner-stat-card overflow-hidden">
      <div className="border-b border-[#e2e8f0] px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-[#023E8A]">
              <Code2 className="h-4 w-4" aria-hidden />
              GitHub Evidence
            </h2>
            {connected && linkedCount > 0 ? (
              <p className="mt-0.5 text-xs text-[#64748b]">
                {linkedCount} in-code {linkedCount === 1 ? "repository" : "repositories"}
              </p>
            ) : null}
          </div>
          {connected ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="rounded-xl border-[#e2e8f0]" onClick={handleExport}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export
              </Button>
              <Button
                size="sm"
                className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]"
                onClick={onSync}
                disabled={syncing}
              >
                <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", syncing && "animate-spin")} />
                {syncing ? "Syncing…" : "Sync GitHub"}
              </Button>
            </div>
          ) : null}
        </div>

        {connected && projects.length > 0 ? (
          <div className="mt-4 space-y-3">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" aria-hidden />
              <Input
                value={repoSearch}
                onChange={(e) => onRepoSearchChange(e.target.value)}
                placeholder="Search repositories…"
                className="rounded-xl border-[#e2e8f0] pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {languageFilters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onLanguageFilterChange(f.id)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    languageFilter === f.id
                      ? "bg-[#0f172a] text-white"
                      : "border border-[#e2e8f0] bg-white text-[#64748b] hover:border-[#023E8A]/30 hover:text-[#023E8A]",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="p-0">
        {!connected ? (
          <IntegrationEmptyState
            icon={Github}
            title="Connect GitHub to sync your coding projects"
            action={
              <Button size="sm" className="rounded-xl bg-[#023E8A] hover:bg-[#012A5C]" onClick={onConnect} disabled={connecting}>
                <Github className="mr-1.5 h-4 w-4" />
                Connect GitHub
              </Button>
            }
          />
        ) : loading ? (
          <div className="p-5">
            <CardSkeleton />
          </div>
        ) : projects.length === 0 ? (
          <IntegrationEmptyState
            icon={Github}
            title="No GitHub repositories found"
            hint="Declare a skill on your profile — matching GitHub repositories will appear here automatically."
            action={
              <Button size="sm" variant="outline" className="rounded-xl" onClick={onSync} disabled={syncing}>
                <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", syncing && "animate-spin")} />
                Sync now
              </Button>
            }
          />
        ) : visibleProjects.length === 0 ? (
          <IntegrationEmptyState
            icon={Code2}
            title="No related project evidence yet"
            hint="Adjust your search or filters, or declare a skill to link matching repositories."
          />
        ) : (
          <div>
            <div className="hidden border-b border-[#e2e8f0] bg-[#f8fafc] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#64748b] md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_48px] md:gap-3">
              <span>Repository</span>
              <span>Language</span>
              <span>Commits</span>
              <span>Linked competency</span>
              <span>Status</span>
              <span className="sr-only">Actions</span>
            </div>
            <div className="divide-y divide-[#e2e8f0]">
              {visibleProjects.map((project) => (
                <GitHubEvidenceRow
                  key={project.repoId}
                  project={project}
                  declaredSkills={declaredSkills}
                  onLinkSkill={onLinkSkill}
                  onOpenSkill={onOpenSkill}
                  reviewStatusVariant={reviewStatusVariant}
                />
              ))}
            </div>
            {hasMoreRepos && !showAllRepos ? (
              <div className="flex justify-center border-t border-[#e2e8f0] bg-[#f8fafc] px-5 py-3">
                <Button size="sm" variant="outline" className="rounded-xl" onClick={onShowMore}>
                  Show more{remainingCount > 0 ? ` (${remainingCount} remaining)` : ""}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
