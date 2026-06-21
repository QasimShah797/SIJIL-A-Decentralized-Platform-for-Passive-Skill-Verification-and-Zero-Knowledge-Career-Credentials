import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RefreshCw, Github, BookOpen, FileUp, Link2, ExternalLink, Unplug, FolderSync, Code2, Search,
} from "lucide-react";
import { formatLanguageBreakdown } from "@/lib/evidence-matching";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useDeclaredSkills, useCredentials } from "@/hooks/useLearnerData";
import {
  fetchLmsEvidence, toCardEvidence, type CustEvidence,
} from "@/lib/cust-lms";
import {
  ensureGitHubContextForUser,
  startGitHubOAuth, syncGitHubPortfolio, disconnectGitHub, linkRepoToSkill,
  buildSkillsForGitHubSync,
} from "@/lib/github-integration";
import { fetchLinkedProjectEvidence, unlinkGitHubRepoFromSkill } from "@/lib/db/github-evidence";
import type { ProjectEvidenceApiView, SkillLinkApiView } from "@/lib/db/github-evidence";
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

// Combine declared skills with skills present in wallet credentials
function buildAllSkills(
  declared: { id: string; name: string }[],
  creds: { skill: string }[],
): { id: string; name: string }[] {
  return buildSkillsForGitHubSync(declared, creds);
}

type LanguageFilter = "all" | "javascript" | "typescript" | "java" | "python" | "other";

const REPO_PAGE_SIZE = 6;

function isProjectLinked(project: ProjectEvidenceApiView): boolean {
  return project.skillLinks.length > 0;
}

function projectMatchesLanguageFilter(
  breakdown: Record<string, number>,
  primaryLanguage: string | null,
  filter: LanguageFilter,
): boolean {
  if (filter === "all") return true;
  const langs = [
    ...Object.keys(breakdown),
    primaryLanguage ?? "",
  ].map((l) => l.trim().toLowerCase()).filter(Boolean);
  if (filter === "other") {
    return langs.some((l) => !["javascript", "typescript", "java", "python"].includes(l));
  }
  return langs.includes(filter);
}

type GhConn = {
  github_username: string;
  github_avatar_url: string | null;
  scopes: string | null;
  connected_at: string;
  last_synced_at: string | null;
};

const MOODLE_SITE_URL = "https://sijil.moodlecloud.com";
const MOODLE_STORAGE_KEY = "sijil_moodle";

type MoodleCourse = {
  id: number;
  fullname?: string;
  shortname?: string;
};

export default function Integrations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { skills: declaredSkills } = useDeclaredSkills();
  const { credentials } = useCredentials();
  const allSkills = buildAllSkills(declaredSkills, credentials);
  const [ghConn, setGhConn] = useState<GhConn | null>(null);
  const [ghProjects, setGhProjects] = useState<ProjectEvidenceApiView[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const ghFetchGen = useRef(0);
  const prevSkillSyncKey = useRef("");

  const [lmsConnected, setLmsConnected] = useState(false);
  const [lmsLastSync, setLmsLastSync] = useState<string | null>(null);
  const [lmsImportedCount, setLmsImportedCount] = useState(0);
  const [moodleCourses, setMoodleCourses] = useState<MoodleCourse[]>([]);
  const [lmsRecords, setLmsRecords] = useState<CustEvidence[]>([]);
  const [lmsSyncing, setLmsSyncing] = useState(false);

  const [repoSearch, setRepoSearch] = useState("");
  const [languageFilter, setLanguageFilter] = useState<LanguageFilter>("all");
  const [showAllRepos, setShowAllRepos] = useState(false);

  const linkedProjects = useMemo(() => ghProjects.filter(isProjectLinked), [ghProjects]);
  const linkedRepoCount = linkedProjects.length;

  const skillSyncKey = useMemo(
    () => declaredSkills.map((s) => `${s.id}:${s.status}`).sort().join("|"),
    [declaredSkills],
  );

  const filteredLinkedProjects = useMemo(() => {
    let list = linkedProjects;
    const q = repoSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.repositoryName.toLowerCase().includes(q) ||
          p.repoFullName.toLowerCase().includes(q),
      );
    }

    if (languageFilter !== "all") {
      list = list.filter((p) =>
        projectMatchesLanguageFilter(p.languageBreakdown, p.primaryLanguage, languageFilter),
      );
    }

    return list;
  }, [linkedProjects, repoSearch, languageFilter]);

  const visibleGhProjects = showAllRepos ? filteredLinkedProjects : filteredLinkedProjects.slice(0, REPO_PAGE_SIZE);
  const hasMoreRepos = filteredLinkedProjects.length > REPO_PAGE_SIZE;

  useEffect(() => {
    setShowAllRepos(false);
  }, [repoSearch, languageFilter]);

  const loadMoodleState = () => {
    try {
      const raw = localStorage.getItem(MOODLE_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        connected?: boolean;
        lastSync?: string | null;
        courseCount?: number;
        courses?: MoodleCourse[];
      };
      setLmsConnected(!!saved.connected);
      setLmsLastSync(saved.lastSync ?? null);
      setMoodleCourses(saved.courses ?? []);
      setLmsImportedCount(saved.courseCount ?? saved.courses?.length ?? 0);
    } catch {
      setLmsConnected(false);
      setLmsImportedCount(0);
      setLmsLastSync(null);
      setMoodleCourses([]);
    }
  };

  const saveMoodleState = (
    connected: boolean,
    courses: MoodleCourse[],
    lastSync: string | null,
  ) => {
    localStorage.setItem(
      MOODLE_STORAGE_KEY,
      JSON.stringify({
        connected,
        courseCount: courses.length,
        courses,
        lastSync,
      }),
    );
  };

  const fetchAndStoreMoodleCourses = async () => {
    const { data, error } = await supabase.functions.invoke("moodle-sync", {
      body: { action: "get_courses" },
    });

    console.log("Moodle courses response:", data);
    console.log("Moodle courses error:", error);

    if (error || data?.error) {
      throw new Error(data?.error || error?.message || "Moodle sync failed");
    }

    const courses = (Array.isArray(data?.courses) ? data.courses : []) as MoodleCourse[];
    const lastSync = new Date().toLocaleString();

    setMoodleCourses(courses);
    setLmsConnected(true);
    setLmsImportedCount(courses.length);
    setLmsLastSync(lastSync);
    saveMoodleState(true, courses, lastSync);

    return courses;
  };

  const loadLms = async () => {
    loadMoodleState();
    try {
      const evidence = await fetchLmsEvidence();
      setLmsRecords(evidence.map(toCardEvidence));
    } catch {
      setLmsRecords([]);
    }
  };

  const clearGitHubState = () => {
    ghFetchGen.current += 1;
    setGhConn(null);
    setGhProjects([]);
    setLoading(false);
    prevSkillSyncKey.current = "";
  };

  const loadGitHub = async () => {
    if (!user) {
      clearGitHubState();
      return;
    }

    ensureGitHubContextForUser(user.id);
    const gen = ++ghFetchGen.current;
    const userId = user.id;

    setLoading(true);
    const { data: conn } = await supabase
      .from("github_connections_public")
      .select("github_username,github_avatar_url,scopes,connected_at,last_synced_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (gen !== ghFetchGen.current) return;
    setGhConn(conn as GhConn | null);
    try {
      setGhProjects(await fetchLinkedProjectEvidence(userId));
    } catch {
      setGhProjects([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user) {
      clearGitHubState();
      return;
    }
    loadGitHub();
    loadLms();
  }, [user?.id]); // eslint-disable-line

  const connectGithub = async () => {
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in before connecting GitHub.", variant: "destructive" });
      return;
    }
    setConnecting(true);
    try {
      toast({
        title: "Connecting GitHub",
        description: "On the next screens, sign in with YOUR GitHub account — not someone else's on this computer.",
      });
      const url = await startGitHubOAuth();
      window.location.href = url;
    } catch (e) {
      toast({ title: "Could not start GitHub OAuth", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      setConnecting(false);
    }
  };

  const syncGithub = async (quiet = false) => {
    setSyncing(true);
    try {
      const result = await syncGitHubPortfolio(allSkills);
      if (!quiet) {
        toast({
          title: "GitHub sync completed",
          description: `${result.repos} repositories checked. Related evidence is linked automatically to your declared skills.`,
        });
      }
      await loadGitHub();
    } catch (e) {
      if (!quiet) {
        const msg = e instanceof Error ? e.message : String(e);
        toast({
          title: "Sync failed",
          description: msg.includes("expired") || msg.includes("401")
            ? "GitHub authorization expired. Please reconnect GitHub."
            : msg,
          variant: "destructive",
        });
      }
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!user || !ghConn || loading || syncing || !skillSyncKey) return;
    if (prevSkillSyncKey.current === skillSyncKey) return;
    prevSkillSyncKey.current = skillSyncKey;
    void syncGithub(true);
  }, [skillSyncKey, ghConn, user, loading]); // eslint-disable-line

  const disconnectGithub = async () => {
    if (!user) return;
    if (!confirm("Disconnect GitHub and remove all synced GitHub activities and repositories?")) return;
    await disconnectGitHub(user.id);
    clearGitHubState();
    toast({ title: "GitHub disconnected" });
  };

  const handleLinkRepo = async (repoId: string, skillId: string | null, skillName: string | null) => {
    if (!user) return;
    try {
      const project = ghProjects.find((p) => p.repoId === repoId);
      if (!skillId) {
        const linkedSkillId = project?.skillLinks[0]?.skillId ?? null;
        await unlinkGitHubRepoFromSkill(user.id, repoId, linkedSkillId);
      } else {
        await linkRepoToSkill(repoId, skillId, skillName);
      }
      await loadGitHub();
      toast({ title: skillId ? "Project linked to skill" : "Skill link removed" });
    } catch (e) {
      toast({ title: "Could not update link", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const connectMoodle = async () => {
    setLmsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("moodle-sync", {
        body: { action: "test" },
      });

      console.log("Moodle test data:", data);
      console.log("Moodle test error:", error);

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Moodle connection failed");
      }

      const courses = await fetchAndStoreMoodleCourses();
      toast({
        title: "Moodle connected successfully",
        description: `${courses.length} courses imported.`,
      });
    } catch (e) {
      toast({
        title: "Moodle connection failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setLmsSyncing(false);
    }
  };

  const syncMoodle = async () => {
    if (!lmsConnected) {
      toast({
        title: "Moodle not connected",
        description: "Connect Moodle first.",
        variant: "destructive",
      });
      return;
    }
    setLmsSyncing(true);
    try {
      const courses = await fetchAndStoreMoodleCourses();
      toast({
        title: "Moodle sync completed",
        description: `${courses.length} courses imported.`,
      });
    } catch (e) {
      toast({
        title: "Moodle sync failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setLmsSyncing(false);
    }
  };

  const disconnectMoodle = async () => {
    if (!confirm("Disconnect Moodle?")) return;
    localStorage.removeItem(MOODLE_STORAGE_KEY);
    setLmsConnected(false);
    setLmsImportedCount(0);
    setLmsLastSync(null);
    setMoodleCourses([]);
    toast({ title: "Moodle disconnected" });
  };

  const syncPortfolio = async () => {
    if (ghConn) await syncGithub();
    if (lmsConnected) await syncMoodle();
    if (!ghConn && !lmsConnected) {
      toast({ title: "Nothing to sync", description: "Connect Moodle or GitHub first." });
    }
  };

  return (
    <AppShell role="learner">
      <PageHeader
        title="External Integrations"
        description="SIJIL pulls supporting records from external systems. Each imported record can be mapped to a declared skill and used as evidence."
        actions={
          <Button onClick={syncPortfolio}>
            <FolderSync className="h-4 w-4 mr-1.5" />Sync Portfolio
          </Button>
        }
      />

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Moodle LMS card */}
        <IntegrationCard
          icon={BookOpen}
          name="Moodle LMS"
          account={lmsConnected ? MOODLE_SITE_URL : undefined}
          connected={lmsConnected}
          lastSync={lmsLastSync}
          records={lmsImportedCount}
          onConnect={connectMoodle}
          onSync={syncMoodle}
          onDisconnect={disconnectMoodle}
          syncing={lmsSyncing}
          connectLabel="Connect Moodle"
          syncLabel="Sync Moodle"
        />

        {/* GitHub card */}
        <IntegrationCard
          icon={Github}
          name="GitHub"
          connected={!!ghConn}
          account={ghConn ? `@${ghConn.github_username}` : undefined}
          lastSync={ghConn?.last_synced_at ? new Date(ghConn.last_synced_at).toLocaleString() : (ghConn ? "Not synced yet" : null)}
          records={ghProjects.length}
          onConnect={connectGithub}
          onSync={() => void syncGithub()}
          onDisconnect={disconnectGithub}
          connecting={connecting}
          syncing={syncing}
          connectLabel="Connect GitHub"
        />

        {/* External certs */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center">
                <FileUp className="h-5 w-5 text-foreground" />
              </div>
              <StatusBadge variant="info">Available</StatusBadge>
            </div>
            <div className="font-medium">External Certificate Upload</div>
            <div className="text-xs text-muted-foreground mt-1">Upload third-party certificates as evidence.</div>
            <Button size="sm" variant="outline" className="w-full mt-4" onClick={() => toast({ title: "Upload coming soon" })}>
              <FileUp className="h-3.5 w-3.5 mr-1.5" />Upload certificate
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* GitHub Evidence */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Code2 className="h-4 w-4" /> GitHub Evidence
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!ghConn ? (
            <EmptyState
              icon={Github}
              title="Connect GitHub to sync your coding projects"
              action={<Button size="sm" onClick={connectGithub} disabled={connecting}><Github className="h-4 w-4 mr-1.5" />Connect GitHub</Button>}
            />
          ) : loading ? (
            <div className="px-2 py-6 text-sm text-muted-foreground">Loading…</div>
          ) : ghProjects.length === 0 ? (
            <EmptyState
              icon={Github}
              title="No GitHub repositories found"
              hint="Declare a skill on your profile — matching GitHub repositories will appear here automatically."
              action={
                <Button size="sm" variant="outline" onClick={syncGithub} disabled={syncing}>
                  <RefreshCw className={"h-3.5 w-3.5 mr-1.5 " + (syncing ? "animate-spin" : "")} />Sync now
                </Button>
              }
            />
          ) : (
            <div className="space-y-5">
              {/* Connected summary */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge variant="verified">GitHub Connected</StatusBadge>
                      <span className="text-sm font-medium">@{ghConn.github_username}</span>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-0.5">
                      <p>{linkedRepoCount} project repositories linked to declared competencies</p>
                      {syncing && <p>Syncing GitHub evidence…</p>}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Last sync:{" "}
                    {ghConn.last_synced_at
                      ? new Date(ghConn.last_synced_at).toLocaleString()
                      : "Not synced yet"}
                  </div>
                </div>
              </div>

              {/* Evidence summary */}
              <div className="rounded-lg border p-3 bg-card">
                <div className="text-sm font-medium mb-1">GitHub Evidence Summary</div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>Related project evidence shown below: {linkedRepoCount}</p>
                  <p>Only projects matched to your declared skills are displayed.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8 h-9"
                      placeholder="Search related evidence..."
                      value={repoSearch}
                      onChange={(e) => setRepoSearch(e.target.value)}
                    />
                  </div>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={languageFilter}
                    onChange={(e) => setLanguageFilter(e.target.value as LanguageFilter)}
                  >
                    <option value="all">All languages</option>
                    <option value="javascript">JavaScript</option>
                    <option value="typescript">TypeScript</option>
                    <option value="java">Java</option>
                    <option value="python">Python</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {filteredLinkedProjects.length === 0 ? (
                  <EmptyState
                    icon={Code2}
                    title="No related project evidence yet"
                    hint="Declare a skill on your profile. GitHub will sync automatically and show matching project repositories here."
                  />
                ) : (
                  <>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {visibleGhProjects.map((project) => (
                        <ProjectEvidenceCard
                          key={project.repoId}
                          project={project}
                          declaredSkills={declaredSkills}
                          onLinkSkill={handleLinkRepo}
                          onOpenSkill={(id) => navigate(`/learner/validation/${id}`)}
                        />
                      ))}
                    </div>
                    {hasMoreRepos && !showAllRepos && (
                      <div className="flex justify-center pt-1">
                        <Button size="sm" variant="outline" onClick={() => setShowAllRepos(true)}>
                          Show more
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent LMS Activity */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Recent LMS Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!lmsConnected ? (
            <EmptyState
              icon={BookOpen}
              title="Connect Moodle to import recent activity"
              hint="Assignments, quizzes, and module completions will appear here."
              action={<Button size="sm" onClick={connectMoodle}><Link2 className="h-4 w-4 mr-1.5" />Connect Moodle</Button>}
            />
          ) : moodleCourses.length === 0 && lmsRecords.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No LMS activity synced yet"
              hint="Run a sync to import your latest Moodle courses."
              action={
                <Button size="sm" variant="outline" onClick={syncMoodle} disabled={lmsSyncing}>
                  <RefreshCw className={"h-3.5 w-3.5 mr-1.5 " + (lmsSyncing ? "animate-spin" : "")} />
                  Sync Moodle
                </Button>
              }
            />
          ) : moodleCourses.length > 0 ? (
            <div className="px-6">
              {moodleCourses.map((course) => (
                <div key={course.id} className="flex items-center justify-between border-b py-3">
                  <div>
                    <p className="font-medium">{course.fullname || course.shortname}</p>
                    <p className="text-sm text-muted-foreground">
                      Moodle LMS · Course ID: {course.id}
                    </p>
                  </div>
                  <span className="text-xs rounded-full border px-2 py-1">
                    Imported
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y">
              {lmsRecords.map((r) => (
                <div key={r.id} className="grid grid-cols-12 gap-4 px-6 py-3.5 items-center">
                  <div className="col-span-6 text-sm font-medium">{r.course_name}</div>
                  <div className="col-span-2 text-xs text-muted-foreground">{r.grade}</div>
                  <div className="col-span-2 text-xs text-muted-foreground">{r.completion_status}</div>
                  <div className="col-span-2 text-xs text-muted-foreground">{new Date(r.fetched_at).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Imported Certificates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileUp className="h-4 w-4" /> Imported Certificates
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <EmptyState
            icon={FileUp}
            title="No external certificates uploaded yet"
            hint="Use the External Certificate Upload card above to add third-party certificates."
          />
        </CardContent>
      </Card>
    </AppShell>
  );
}

function IntegrationCard({
  icon: Icon, name, account, connected, lastSync, records, onConnect, onSync, onDisconnect, connecting, syncing, connectLabel, syncLabel,
}: {
  icon: any; name: string; account?: string; connected: boolean;
  lastSync: string | null; records: number;
  onConnect: () => void; onSync: () => void; onDisconnect: () => void;
  connecting?: boolean; syncing?: boolean; connectLabel: string; syncLabel?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center">
            <Icon className="h-5 w-5 text-foreground" />
          </div>
          <StatusBadge variant={connected ? "verified" : "warning"}>
            {connected ? "Connected" : "Not connected"}
          </StatusBadge>
        </div>
        <div className="font-medium">{name}</div>
        {account && <div className="text-xs text-muted-foreground mt-0.5">{account}</div>}
        <div className="text-xs text-muted-foreground mt-1">Last sync: {lastSync ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{records} records imported</div>
        <div className="mt-4 flex gap-2">
          {connected ? (
            <>
              <Button size="sm" variant="outline" className="flex-1" onClick={onSync} disabled={syncing}>
                <RefreshCw className={"h-3.5 w-3.5 mr-1.5 " + (syncing ? "animate-spin" : "")} />
                {syncing ? "Syncing…" : (syncLabel ?? "Sync")}
              </Button>
              <Button size="sm" variant="ghost" onClick={onConnect} title="Reconnect">
                <Link2 className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={onDisconnect} title="Disconnect">
                <Unplug className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Button size="sm" className="flex-1" onClick={onConnect} disabled={connecting}>
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              {connecting ? "Redirecting…" : connectLabel}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon: Icon, title, hint, action }: { icon: any; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="px-6 py-10 text-center">
      <Icon className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
      <div className="text-sm font-medium mb-1">{title}</div>
      {hint && <div className="text-xs text-muted-foreground mb-4">{hint}</div>}
      {action}
    </div>
  );
}

function reviewStatusVariant(status: string): "verified" | "neutral" | "info" | "destructive" {
  if (status === "Imported Context Review" || status === "Context Verified Review") return "verified";
  if (status === "Review Request Sent" || status === "Awaiting Feedback") return "info";
  return "neutral";
}

function ProjectEvidenceCard({
  project, declaredSkills, onLinkSkill, onOpenSkill,
}: {
  project: ProjectEvidenceApiView;
  declaredSkills: { id: string; name: string }[];
  onLinkSkill: (repoId: string, skillId: string | null, skillName: string | null) => void;
  onOpenSkill: (skillId: string) => void;
}) {
  const linked = isProjectLinked(project);
  const breakdownText = formatLanguageBreakdown(project.languageBreakdown);
  const primaryLink = project.skillLinks[0];
  const [reviewSummary, setReviewSummary] = useState<EvidenceReviewSummary | null>(null);
  const [eligibleReviewers, setEligibleReviewers] = useState<EligibleReviewerView[]>([]);
  const [requestOpen, setRequestOpen] = useState(false);
  const [selectedReviewerId, setSelectedReviewerId] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!isApiEnabled() || !project.evidenceRecordId || !linked) return;
    (async () => {
      await importExternalReviewsApi(project.evidenceRecordId);
      const summary = await getEvidenceReviewsApi(project.evidenceRecordId);
      setReviewSummary(summary);
    })();
  }, [project.evidenceRecordId, linked]);

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

  return (
    <div className="rounded-lg border bg-card p-3 hover:shadow-sm transition flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <a
            href={project.repositoryUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-sm hover:underline inline-flex items-center gap-1 truncate"
          >
            {project.repositoryName}
            <ExternalLink className="h-3 w-3 opacity-60 shrink-0" />
          </a>
          <div className="text-[11px] text-muted-foreground truncate">{project.repoFullName}</div>
        </div>
        <StatusBadge variant={linked ? "verified" : "neutral"}>
          {linked ? "Project Evidence" : "Unlinked"}
        </StatusBadge>
      </div>

      {breakdownText ? (
        <div className="text-xs text-muted-foreground mb-2">
          <div className="font-medium text-foreground/80 mb-0.5">Project language breakdown from GitHub</div>
          <div>{breakdownText}</div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground mb-2">
          Primary language: {project.primaryLanguage ?? "—"}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mb-2">
        {typeof project.commitCount === "number" && (
          <span>{project.commitCount} commits</span>
        )}
      </div>

      {project.skillLinks.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {project.skillLinks.map((link) => (
            <div key={link.skillId} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{link.skillName}</span>
              {link.matchReason && (
                <div className="mt-0.5">{link.matchReason}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {reviewSummary && linked && (
        <div className="mb-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Context review</span>
            <StatusBadge variant={reviewStatusVariant(reviewSummary.displayStatus)}>
              {reviewSummary.displayStatus}
            </StatusBadge>
          </div>
          {reviewSummary.reviews.slice(0, 1).map((r) => (
            <div key={r.id} className="text-[11px] text-muted-foreground line-clamp-2">
              {r.reviewerName}: {r.comment}
            </div>
          ))}
          {canRequestContextReview(reviewSummary) && primaryLink && (
            <div className="pt-1">
              {!requestOpen ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs w-full"
                  onClick={() => {
                    setRequestOpen(true);
                    void loadEligibleReviewers();
                  }}
                >
                  Request Context Review
                </Button>
              ) : (
                <div className="space-y-1.5 rounded-md border p-2">
                  {eligibleReviewers.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No eligible context-linked reviewers found yet. Sync GitHub to refresh contributors.</p>
                  ) : (
                    <>
                      <select
                        className="w-full h-7 rounded-md border border-input bg-background px-2 text-xs"
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
                        className="h-7 text-xs"
                        value={reviewerEmail}
                        onChange={(e) => setReviewerEmail(e.target.value)}
                      />
                    </>
                  )}
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs flex-1"
                      disabled={requesting || eligibleReviewers.length === 0}
                      onClick={() => void handleRequestReview()}
                    >
                      {requesting ? "Sending…" : "Send request"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setRequestOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-auto">
        {primaryLink && (
          <button
            onClick={() => onOpenSkill(primaryLink.skillId)}
            className="mb-2 text-xs text-primary hover:underline text-left block"
          >
            → View validation trail: {primaryLink.skillName}
          </button>
        )}
        <label className="text-[11px] text-muted-foreground">Remove skill link</label>
        {declaredSkills.length > 0 && primaryLink ? (
          <select
            className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
            defaultValue={primaryLink.skillId}
            onChange={(e) => {
              const val = e.target.value;
              if (!val) onLinkSkill(project.repoId, null, null);
            }}
          >
            <option value={primaryLink.skillId}>{primaryLink.skillName} (linked)</option>
            <option value="">— Remove link —</option>
          </select>
        ) : null}
      </div>
    </div>
  );
}
