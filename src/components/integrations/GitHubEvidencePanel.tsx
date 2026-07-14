import {
  Github,
  RefreshCw,
  Search,
  Code2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectEvidenceApiView } from "@/lib/db/github-evidence";
import { IntegrationEmptyState } from "./IntegrationEmptyState";
import { GitHubEvidenceRow } from "./GitHubEvidenceRow";

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

export function GitHubEvidencePanel(props: GitHubEvidencePanelProps) {
  const {
    connected,
    loading,
    syncing,
    username,
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

  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Code2 className="h-4 w-4" aria-hidden />
            GitHub Evidence
            {connected && linkedCount > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                · {linkedCount} linked {linkedCount === 1 ? "repository" : "repositories"}
              </span>
            )}
          </CardTitle>
          {connected && (
            <Button size="sm" variant="outline" onClick={onSync} disabled={syncing} className="shrink-0">
              <RefreshCw className={"h-3.5 w-3.5 mr-1.5 " + (syncing ? "animate-spin" : "")} />
              {syncing ? "Syncing…" : "Sync GitHub"}
            </Button>
          )}
        </div>

        {connected && projects.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                className="pl-8 h-9"
                placeholder="Search repositories…"
                value={repoSearch}
                onChange={(e) => onRepoSearchChange(e.target.value)}
                aria-label="Search repositories"
              />
            </div>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[140px]"
              value={languageFilter}
              onChange={(e) => onLanguageFilterChange(e.target.value as LanguageFilter)}
              aria-label="Filter by language"
            >
              <option value="all">All languages</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="java">Java</option>
              <option value="python">Python</option>
              <option value="other">Other</option>
            </select>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {!connected ? (
          <IntegrationEmptyState
            icon={Github}
            title="Connect GitHub to sync your coding projects"
            action={
              <Button size="sm" onClick={onConnect} disabled={connecting}>
                <Github className="h-4 w-4 mr-1.5" />
                Connect GitHub
              </Button>
            }
          />
        ) : loading ? (
          <p className="py-6 text-sm text-muted-foreground px-1">Loading…</p>
        ) : projects.length === 0 ? (
          <IntegrationEmptyState
            icon={Github}
            title="No GitHub repositories found"
            hint="Declare a skill on your profile — matching GitHub repositories will appear here automatically."
            action={
              <Button size="sm" variant="outline" onClick={onSync} disabled={syncing}>
                <RefreshCw className={"h-3.5 w-3.5 mr-1.5 " + (syncing ? "animate-spin" : "")} />
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
          <div className="rounded-xl border overflow-hidden">
            <div className="hidden md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,0.75fr)_minmax(0,0.75fr)_minmax(0,1fr)_minmax(0,0.75fr)_48px] gap-3 px-4 py-2.5 bg-muted/40 text-xs font-medium text-muted-foreground border-b">
              <span>Repository</span>
              <span>Language</span>
              <span>Commits</span>
              <span>Linked competency</span>
              <span>Status</span>
              <span className="sr-only">Actions</span>
            </div>
            <div className="divide-y">
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
            {hasMoreRepos && !showAllRepos && (
              <div className="border-t px-4 py-3 flex justify-center bg-muted/20">
                <Button size="sm" variant="outline" onClick={onShowMore}>
                  Show more{remainingCount > 0 ? ` (${remainingCount} remaining)` : ""}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
