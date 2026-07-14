import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { Button } from "@/components/ui/button";
import { RefreshCw, Github, BookOpen, FileUp, FolderSync } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useDeclaredSkills, useCredentials } from "@/hooks/useLearnerData";
import {
  fetchLmsEvidence,
  toCardEvidence,
  type CustEvidence,
} from "@/lib/cust-lms";
import {
  disconnectMoodle as disconnectMoodleDb,
  fetchMoodleConnection,
  fetchMoodleCourseActivities,
  hasMoodleAccessControlWarning,
  resolveMoodleConnectionSiteHost,
  syncMoodleData,
  testMoodleConnection,
  type MoodleCourseActivity,
  type MoodleConnection,
} from "@/lib/moodle-integration";
import {
  ensureGitHubContextForUser,
  startGitHubOAuth,
  syncGitHubPortfolio,
  disconnectGitHub,
  linkRepoToSkill,
  buildSkillsForGitHubSync,
} from "@/lib/github-integration";
import { fetchLinkedProjectEvidence, unlinkGitHubRepoFromSkill } from "@/lib/db/github-evidence";
import type { ProjectEvidenceApiView } from "@/lib/db/github-evidence";
import { IntegrationSummary } from "@/components/integrations/IntegrationSummary";
import { IntegrationConnectionCard } from "@/components/integrations/IntegrationConnectionCard";
import {
  GitHubEvidencePanel,
  type LanguageFilter,
} from "@/components/integrations/GitHubEvidencePanel";
import { LMSActivityPanel } from "@/components/integrations/LMSActivityPanel";
import { CertificatesPanel } from "@/components/integrations/CertificatesPanel";

function buildAllSkills(
  declared: { id: string; name: string }[],
  creds: { skill: string }[],
): { id: string; name: string }[] {
  return buildSkillsForGitHubSync(declared, creds);
}

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

function formatPortfolioSyncTime(
  ghSyncedAt: string | null | undefined,
  lmsSyncedAt: string | null | undefined,
): string | null {
  const times = [ghSyncedAt, lmsSyncedAt]
    .filter(Boolean)
    .map((t) => new Date(String(t)).getTime())
    .filter((n) => Number.isFinite(n));
  if (!times.length) return null;
  return new Date(Math.max(...times)).toLocaleString();
}

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
  const [portfolioSyncing, setPortfolioSyncing] = useState(false);
  const ghFetchGen = useRef(0);
  const prevSkillSyncKey = useRef("");

  const [lmsConnected, setLmsConnected] = useState(false);
  const [moodleConnection, setMoodleConnection] = useState<MoodleConnection | null>(null);
  const [lmsLastSync, setLmsLastSync] = useState<string | null>(null);
  const [lmsImportedCount, setLmsImportedCount] = useState(0);
  const [moodleActivities, setMoodleActivities] = useState<MoodleCourseActivity[]>([]);
  const [lmsRecords, setLmsRecords] = useState<CustEvidence[]>([]);
  const [lmsSyncing, setLmsSyncing] = useState(false);
  const [moodleLoading, setMoodleLoading] = useState(false);
  const [moodleError, setMoodleError] = useState<string | null>(null);

  const [repoSearch, setRepoSearch] = useState("");
  const [languageFilter, setLanguageFilter] = useState<LanguageFilter>("all");
  const [showAllRepos, setShowAllRepos] = useState(false);

  const linkedProjects = useMemo(() => ghProjects.filter(isProjectLinked), [ghProjects]);
  const linkedRepoCount = linkedProjects.length;

  const skillSyncKey = useMemo(
    () => declaredSkills.map((s) => `${s.id}:${s.status}`).sort().join("|"),
    [declaredSkills],
  );
  const declaredSkillRefs = useMemo(
    () => declaredSkills.map((s) => ({ id: s.id, name: s.name })),
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

  const visibleGhProjects = showAllRepos
    ? filteredLinkedProjects
    : filteredLinkedProjects.slice(0, REPO_PAGE_SIZE);
  const hasMoreRepos = filteredLinkedProjects.length > REPO_PAGE_SIZE;
  const remainingRepoCount = Math.max(0, filteredLinkedProjects.length - REPO_PAGE_SIZE);

  const connectedSources = (lmsConnected ? 1 : 0) + (ghConn ? 1 : 0);
  const certificateCount = 0;
  const lastPortfolioSync = formatPortfolioSyncTime(
    ghConn?.last_synced_at,
    moodleConnection?.last_synced_at,
  );

  useEffect(() => {
    setShowAllRepos(false);
  }, [repoSearch, languageFilter]);

  const loadMoodleFromDb = async () => {
    setMoodleLoading(true);
    setMoodleError(null);
    try {
      const conn = await fetchMoodleConnection();
      setMoodleConnection(conn);
      setLmsConnected(!!conn);
      setLmsLastSync(
        conn?.last_synced_at ? new Date(conn.last_synced_at).toLocaleString() : null,
      );

      if (conn) {
        const activities = await fetchMoodleCourseActivities();
        setMoodleActivities(activities);
        const assignmentCount = activities.reduce((n, c) => n + c.assignments.length, 0);
        setLmsImportedCount(assignmentCount || activities.length);
      } else {
        setMoodleActivities([]);
        setLmsImportedCount(0);
      }
    } catch (e) {
      if (e instanceof Error && e.message === "Sign in required.") {
        setLmsConnected(false);
        setMoodleActivities([]);
        setLmsImportedCount(0);
        return;
      }
      setMoodleError(e instanceof Error ? e.message : "Could not load Moodle activity.");
      setMoodleActivities([]);
    } finally {
      setMoodleLoading(false);
    }
  };

  const loadLms = async () => {
    await loadMoodleFromDb();
    try {
      const evidence = await fetchLmsEvidence();
      setLmsRecords(evidence.filter((e) => e.source !== "Moodle LMS").map(toCardEvidence));
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
      setGhProjects(await fetchLinkedProjectEvidence(userId, declaredSkillRefs));
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
  }, [user?.id, declaredSkillRefs.map((s) => s.id).join("|")]); // eslint-disable-line

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
    setMoodleError(null);
    try {
      const test = await testMoodleConnection();
      if (!test.ok) throw new Error(test.error ?? "Moodle connection failed");
      if (test.staleDeploy) {
        toast({
          title: "Moodle function update required",
          description: "Remote moodle-sync is outdated. Run: npm run supabase:deploy-moodle",
          variant: "destructive",
        });
      }

      const result = await syncMoodleData();
      await loadMoodleFromDb();
      toast({
        title: "Moodle data updated successfully.",
        description: `${result.courses} courses · ${result.assignments} assignments · ${result.feedback} feedback records imported.`,
      });
      if (result.warnings.length) {
        toast({
          title: hasMoodleAccessControlWarning(result.warnings)
            ? "Moodle permission issue"
            : "Sync notes",
          description: result.warnings.slice(0, 2).join(" "),
          variant: hasMoodleAccessControlWarning(result.warnings) ? "destructive" : "default",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMoodleError(msg);
      toast({
        title: "Moodle connection failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLmsSyncing(false);
    }
  };

  const refreshMoodle = async () => {
    setLmsSyncing(true);
    setMoodleError(null);
    try {
      const result = await syncMoodleData();
      await loadMoodleFromDb();
      toast({
        title: "Moodle data updated successfully.",
        description: `${result.assignments} assignments · ${result.feedback} feedback records across ${result.courses} courses.`,
      });
      if (result.warnings.length) {
        toast({
          title: hasMoodleAccessControlWarning(result.warnings)
            ? "Moodle permission issue"
            : "Sync notes",
          description: result.warnings.slice(0, 2).join(" "),
          variant: hasMoodleAccessControlWarning(result.warnings) ? "destructive" : "default",
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMoodleError(msg);
      toast({
        title: "Moodle sync failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLmsSyncing(false);
    }
  };

  const syncMoodle = refreshMoodle;

  const disconnectMoodle = async () => {
    if (!confirm("Disconnect Moodle? Imported activity will remain in your evidence history.")) return;
    try {
      await disconnectMoodleDb();
      setLmsConnected(false);
      setMoodleConnection(null);
      setLmsImportedCount(0);
      setLmsLastSync(null);
      setMoodleActivities([]);
      setMoodleError(null);
      toast({ title: "Moodle disconnected" });
    } catch (e) {
      toast({
        title: "Could not disconnect Moodle",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const moodleSiteHost = resolveMoodleConnectionSiteHost(moodleConnection);

  const syncPortfolio = async () => {
    setPortfolioSyncing(true);
    try {
      if (ghConn) await syncGithub();
      if (lmsConnected) await syncMoodle();
      if (!ghConn && !lmsConnected) {
        toast({ title: "Nothing to sync", description: "Connect Moodle or GitHub first." });
      }
    } finally {
      setPortfolioSyncing(false);
    }
  };

  const uploadCertificate = () => {
    toast({ title: "Upload coming soon" });
  };

  const portfolioBusy = portfolioSyncing || syncing || lmsSyncing;

  return (
    <AppShell role="learner">
      <PageHeader
        title="External Integrations"
        description="Connect external platforms, synchronize supporting records, and map imported evidence to your declared competencies."
        className="mb-8"
        actions={
          <Button onClick={syncPortfolio} disabled={portfolioBusy}>
            <FolderSync className={"h-4 w-4 mr-1.5 " + (portfolioBusy ? "animate-spin" : "")} />
            {portfolioBusy ? "Syncing…" : "Sync Portfolio"}
          </Button>
        }
      />

      <div className="space-y-6">
        <IntegrationSummary
          connectedSources={connectedSources}
          githubEvidence={linkedRepoCount}
          lmsRecords={lmsImportedCount}
          certificates={certificateCount}
          lastPortfolioSync={lastPortfolioSync}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <IntegrationConnectionCard
            icon={BookOpen}
            name="Moodle LMS"
            status={lmsConnected ? "connected" : "disconnected"}
            account={moodleConnection?.moodle_email ?? undefined}
            subtitle={lmsConnected ? moodleSiteHost : undefined}
            lastSync={lmsLastSync}
            records={lmsImportedCount}
            recordsLabel="LMS records"
            primaryLabel={lmsConnected ? "Sync Moodle Activities" : "Connect Moodle"}
            onPrimary={lmsConnected ? syncMoodle : connectMoodle}
            primaryLoading={lmsSyncing}
            onConnect={connectMoodle}
            onSync={syncMoodle}
            onDisconnect={disconnectMoodle}
            connectLoading={lmsSyncing}
            syncLoading={lmsSyncing}
          />

          <IntegrationConnectionCard
            icon={Github}
            name="GitHub"
            status={ghConn ? "connected" : "disconnected"}
            account={ghConn ? `@${ghConn.github_username}` : undefined}
            lastSync={
              ghConn?.last_synced_at
                ? new Date(ghConn.last_synced_at).toLocaleString()
                : ghConn
                  ? "Not synced yet"
                  : null
            }
            records={ghProjects.length}
            recordsLabel="repositories imported"
            primaryLabel={ghConn ? "Sync GitHub" : "Connect GitHub"}
            onPrimary={ghConn ? () => void syncGithub() : connectGithub}
            primaryLoading={syncing}
            onConnect={connectGithub}
            onSync={() => void syncGithub()}
            onDisconnect={disconnectGithub}
            connectLoading={connecting}
            syncLoading={syncing}
            connectLabel="Connect GitHub"
          />

          <IntegrationConnectionCard
            icon={FileUp}
            name="External Certificate Upload"
            status="available"
            subtitle="Upload third-party certificates as evidence."
            records={certificateCount}
            recordsLabel="certificates uploaded"
            primaryLabel="Upload certificate"
            onPrimary={uploadCertificate}
            showPrimary
          />
        </div>

        <GitHubEvidencePanel
          connected={!!ghConn}
          loading={loading}
          syncing={syncing}
          username={ghConn?.github_username}
          lastSyncedAt={ghConn?.last_synced_at}
          linkedCount={linkedRepoCount}
          projects={ghProjects}
          visibleProjects={visibleGhProjects}
          declaredSkills={declaredSkills}
          repoSearch={repoSearch}
          onRepoSearchChange={setRepoSearch}
          languageFilter={languageFilter}
          onLanguageFilterChange={setLanguageFilter}
          hasMoreRepos={hasMoreRepos}
          showAllRepos={showAllRepos}
          onShowMore={() => setShowAllRepos(true)}
          remainingCount={remainingRepoCount}
          onConnect={connectGithub}
          onSync={() => void syncGithub()}
          connecting={connecting}
          onLinkSkill={handleLinkRepo}
          onOpenSkill={(id) => navigate(`/learner/validation/${id}`)}
        />

        <LMSActivityPanel
          connected={lmsConnected}
          loading={moodleLoading}
          syncing={lmsSyncing}
          error={moodleError}
          moodleEmail={moodleConnection?.moodle_email}
          moodleSiteHost={moodleSiteHost}
          lastSync={lmsLastSync}
          recordCount={lmsImportedCount}
          activities={moodleActivities}
          otherRecords={lmsRecords}
          onConnect={connectMoodle}
          onSync={refreshMoodle}
        />

        <CertificatesPanel onUpload={uploadCertificate} />
      </div>
    </AppShell>
  );
}
