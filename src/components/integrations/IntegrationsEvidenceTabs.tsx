import { useMemo, useState } from "react";
import {
  BookOpen,
  Code2,
  FileText,
  Layers,
  MoreHorizontal,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  formatGradeDisplay,
  type MoodleCourseActivity,
} from "@/lib/moodle-integration";
import type { ProjectEvidenceApiView } from "@/lib/db/github-evidence";

export type IntegrationsEvidenceTabsProps = {
  activities: MoodleCourseActivity[];
  lmsLoading?: boolean;
  projects: ProjectEvidenceApiView[];
  githubLoading?: boolean;
  declaredSkills: { id: string; name: string }[];
  onOpenSkill: (skillId: string) => void;
  onLinkSkill: (repoId: string, skillId: string | null, skillName: string | null) => void;
  defaultTab?: "learning" | "repos";
  tab?: "learning" | "repos";
  onTabChange?: (tab: "learning" | "repos") => void;
};

type LearningRow = {
  id: string;
  activity: string;
  course: string;
  result: string;
  graded: boolean;
  date: string;
  competency: string | null;
};

function formatShortDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function inferCompetency(
  tags: string[],
  courseName: string,
  activityName: string,
  skills: { id: string; name: string }[],
): string | null {
  if (tags.length > 0) return tags[0];
  const haystack = `${courseName} ${activityName}`.toLowerCase();
  const match = skills.find((s) => haystack.includes(s.name.toLowerCase()));
  return match?.name ?? null;
}

export function IntegrationsEvidenceTabs({
  activities,
  lmsLoading = false,
  projects,
  githubLoading = false,
  declaredSkills,
  onOpenSkill,
  onLinkSkill,
  defaultTab = "learning",
  tab,
  onTabChange,
}: IntegrationsEvidenceTabsProps) {
  const [internalTab, setInternalTab] = useState<"learning" | "repos">(defaultTab);
  const activeTab = tab ?? internalTab;

  const learningRows = useMemo<LearningRow[]>(() => {
    const rows: LearningRow[] = [];
    for (const course of activities) {
      for (const assignment of course.assignments) {
        const result = formatGradeDisplay(assignment);
        const graded = Boolean(assignment.grade) && !/^not\s*graded$/i.test(result.trim());
        rows.push({
          id: assignment.id,
          activity: assignment.name,
          course: course.courseName,
          result: graded ? result : "Not Graded",
          graded,
          date: formatShortDate(assignment.gradedAt ?? assignment.submittedAt ?? assignment.importedAt),
          competency: inferCompetency(
            assignment.competencyTags,
            course.courseName,
            assignment.name,
            declaredSkills,
          ),
        });
      }
    }
    return rows;
  }, [activities, declaredSkills]);

  return (
    <div id="integrations-records" className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-sm">
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          const next = value === "repos" ? "repos" : "learning";
          setInternalTab(next);
          onTabChange?.(next);
        }}
      >
        <div className="border-b border-[#e2e8f0] px-4 pt-3 sm:px-5">
          <TabsList className="h-auto gap-6 rounded-none bg-transparent p-0">
            <TabsTrigger
              value="learning"
              className="rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-1 text-sm font-semibold text-[#64748b] shadow-none data-[state=active]:border-[#023E8A] data-[state=active]:bg-transparent data-[state=active]:text-[#023E8A] data-[state=active]:shadow-none"
            >
              <BookOpen className="mr-1.5 h-4 w-4" aria-hidden />
              Learning Records
            </TabsTrigger>
            <TabsTrigger
              value="repos"
              className="rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-1 text-sm font-semibold text-[#64748b] shadow-none data-[state=active]:border-[#023E8A] data-[state=active]:bg-transparent data-[state=active]:text-[#023E8A] data-[state=active]:shadow-none"
            >
              <Code2 className="mr-1.5 h-4 w-4" aria-hidden />
              Code Repositories
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="learning" className="mt-0 focus-visible:ring-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#e2e8f0] text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
                  <th className="px-5 py-3 font-semibold">Activity</th>
                  <th className="px-5 py-3 font-semibold">Course</th>
                  <th className="px-5 py-3 font-semibold">Result</th>
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Linked Competency</th>
                  <th className="px-5 py-3 font-semibold"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {lmsLoading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-[#64748b]">
                      Loading learning records…
                    </td>
                  </tr>
                ) : learningRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-[#64748b]">
                      No learning records yet. Connect Moodle and sync to import assignments.
                    </td>
                  </tr>
                ) : (
                  learningRows.map((row) => (
                    <tr key={row.id} className="border-b border-[#f1f5f9] last:border-0">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f1f5f9] text-[#64748b]">
                            <FileText className="h-4 w-4" aria-hidden />
                          </span>
                          <span className="font-medium text-[#0f172a]">{row.activity}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-[#64748b]">{row.course}</td>
                      <td className="px-5 py-4">
                        {row.graded ? (
                          <span className="inline-flex rounded-full bg-[#ecfdf5] px-2.5 py-1 text-xs font-semibold text-[#059669]">
                            {row.result}
                          </span>
                        ) : (
                          <span className="text-[#64748b]">{row.result}</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-[#64748b]">{row.date}</td>
                      <td className="px-5 py-4">
                        {row.competency ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eef2ff] px-2.5 py-1 text-xs font-semibold text-[#4338ca]">
                            <Layers className="h-3.5 w-3.5" aria-hidden />
                            {row.competency}
                          </span>
                        ) : (
                          <span className="text-[#94a3b8]">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#94a3b8] hover:bg-[#f8fafc]"
                          aria-label="Record options"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="repos" className="mt-0 focus-visible:ring-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#e2e8f0] text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
                  <th className="px-5 py-3 font-semibold">Repository</th>
                  <th className="px-5 py-3 font-semibold">Language</th>
                  <th className="px-5 py-3 font-semibold">Linked Competency</th>
                  <th className="px-5 py-3 font-semibold">Updated</th>
                  <th className="px-5 py-3 font-semibold"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {githubLoading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-[#64748b]">
                      Loading repositories…
                    </td>
                  </tr>
                ) : projects.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-[#64748b]">
                      No repositories yet. Connect GitHub and sync to import projects.
                    </td>
                  </tr>
                ) : (
                  projects.map((project) => {
                    const link = project.skillLinks[0];
                    return (
                      <tr key={project.repoId} className="border-b border-[#f1f5f9] last:border-0">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f1f5f9] text-[#0f172a]">
                              <Code2 className="h-4 w-4" aria-hidden />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-[#0f172a]">{project.repositoryName}</p>
                              <p className="truncate text-xs text-[#94a3b8]">{project.repoFullName}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-[#64748b]">
                          {project.primaryLanguage ?? "—"}
                        </td>
                        <td className="px-5 py-4">
                          {link ? (
                            <button
                              type="button"
                              onClick={() => onOpenSkill(link.skillId)}
                              className="inline-flex items-center gap-1.5 rounded-full bg-[#eef2ff] px-2.5 py-1 text-xs font-semibold text-[#4338ca] hover:bg-[#e0e7ff]"
                            >
                              <Layers className="h-3.5 w-3.5" aria-hidden />
                              {link.skillName}
                            </button>
                          ) : (
                            <select
                              className="rounded-lg border border-[#e2e8f0] bg-white px-2 py-1 text-xs text-[#334155]"
                              defaultValue=""
                              onChange={(e) => {
                                const skill = declaredSkills.find((s) => s.id === e.target.value);
                                if (!skill) return;
                                onLinkSkill(project.repoId, skill.id, skill.name);
                              }}
                            >
                              <option value="">Link skill…</option>
                              {declaredSkills.map((skill) => (
                                <option key={skill.id} value={skill.id}>
                                  {skill.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-5 py-4 text-[#64748b]">
                          {formatShortDate(project.lastUpdated)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#94a3b8] hover:bg-[#f8fafc]"
                                aria-label="Repository options"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {link ? (
                                <DropdownMenuItem onClick={() => onOpenSkill(link.skillId)}>
                                  Open competency
                                </DropdownMenuItem>
                              ) : null}
                              {project.repositoryUrl ? (
                                <DropdownMenuItem asChild>
                                  <a href={project.repositoryUrl} target="_blank" rel="noreferrer">
                                    Open on GitHub
                                  </a>
                                </DropdownMenuItem>
                              ) : null}
                              {link ? (
                                <DropdownMenuItem
                                  onClick={() => onLinkSkill(project.repoId, null, null)}
                                >
                                  Unlink skill
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
