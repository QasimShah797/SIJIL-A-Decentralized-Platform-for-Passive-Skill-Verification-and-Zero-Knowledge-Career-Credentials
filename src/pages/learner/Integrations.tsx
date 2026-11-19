import { useEffect, useMemo, useRef, useState } from "react";
import { LearnerWorkspaceShell } from "@/components/sijil/LearnerWorkspaceShell";
import { ConfirmDestructiveDialog } from "@/components/sijil/ConfirmDestructiveDialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useDeclaredSkills, useCredentials } from "@/hooks/useLearnerData";
import { Github, BookOpen, Code2 } from "lucide-react";
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
  userFacingMoodleWarnings,
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
import {
  IntegrationsHero,
  LinkedPlatformCard,
  LinkedPlatformsHeader,
} from "@/components/integrations/IntegrationsPagePanels";
import { IntegrationsEvidenceTabs } from "@/components/integrations/IntegrationsEvidenceTabs";

function buildAllSkills(
  declared: { id: string; name: string }[],
  creds: { skill: string }[],
): { id: string; name: string }[] {
  return buildSkillsForGitHubSync(declared, creds);
}

type GhConn = {
  github_username: string;
  github_avatar_url: string | null;
  scopes: string | null;
  connected_at: string;
  last_synced_at: string | null;
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
  const [moodleConnection, setMoodleConnection] = useState<MoodleConnection | null>(null);
  const [lmsLastSync, setLmsLastSync] = useState<string | null>(null);
  const [lmsImportedCount, setLmsImportedCount] = useState(0);
  const [moodleActivities, setMoodleActivities] = useState<MoodleCourseActivity[]>([]);
  const [lmsRecords, setLmsRecords] = useState<CustEvidence[]>([]);
  const [lmsSyncing, setLmsSyncing] = useState(false);
  const [moodleLoading, setMoodleLoading] = useState(false);
  const [moodleError, setMoodleError] = useState<string | null>(null);

  const [disconnectTarget, setDisconnectTarget] = useState<"github" | "moodle" | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [recordsTab, setRecordsTab] = useState<"learning" | "repos">("learning");

  const skillSyncKey = useMemo(
    () => declaredSkills.map((s) => `${s.id}:${s.status}`).sort().join("|"),
    [declaredSkills],
  );
  const declaredSkillRefs = useMemo(
    () => declaredSkills.map((s) => ({ id: s.id, name: s.name })),
    [declaredSkills],
  );

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
    await disconnectGitHub(user.id);
    clearGitHubState();
    toast({ title: "GitHub disconnected" });
  };

  const handleDisconnectGithub = () => setDisconnectTarget("github");

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
      const notes = userFacingMoodleWarnings(result.warnings);
      if (notes.length) {
        toast({
          title: hasMoodleAccessControlWarning(notes)
            ? "Moodle permission issue"
            : "Sync notes",
          description: notes.slice(0, 2).join(" "),
          variant: hasMoodleAccessControlWarning(notes) ? "destructive" : "default",
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
      const notes = userFacingMoodleWarnings(result.warnings);
      if (notes.length) {
        toast({
          title: hasMoodleAccessControlWarning(notes)
            ? "Moodle permission issue"
            : "Sync notes",
          description: notes.slice(0, 2).join(" "),
          variant: hasMoodleAccessControlWarning(notes) ? "destructive" : "default",
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

  const handleDisconnectMoodle = () => setDisconnectTarget("moodle");

  const confirmDisconnect = async () => {
    if (!disconnectTarget) return;
    setDisconnecting(true);
    try {
      if (disconnectTarget === "github") {
        await disconnectGithub();
      } else {
        await disconnectMoodle();
      }
      setDisconnectTarget(null);
    } finally {
      setDisconnecting(false);
    }
  };

  const courseRecordCount = moodleActivities.length;
  const githubLastSync = ghConn?.last_synced_at
    ? new Date(ghConn.last_synced_at).toLocaleString()
    : null;

  const scrollToRecords = (tab: "learning" | "repos") => {
    setRecordsTab(tab);
    requestAnimationFrame(() => {
      document.getElementById("integrations-records")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <LearnerWorkspaceShell variant="dashboard">
      <div className="space-y-8">
        <IntegrationsHero />

        <section>
          <LinkedPlatformsHeader />
          <div className="grid gap-4 md:grid-cols-2">
            <LinkedPlatformCard
              name="Moodle LMS"
              description="Institutional learning records."
              icon={BookOpen}
              iconClassName="bg-[#fff7ed] text-[#ea580c]"
              active={lmsConnected}
              metaIcon={BookOpen}
              metaLabel={`${courseRecordCount} course record${courseRecordCount === 1 ? "" : "s"}`}
              lastSync={lmsLastSync}
              primaryLabel={lmsConnected ? "View Records" : "Connect Moodle"}
              onPrimary={lmsConnected ? () => scrollToRecords("learning") : () => void connectMoodle()}
              onConnect={() => void connectMoodle()}
              onSync={() => void syncMoodle()}
              onDisconnect={handleDisconnectMoodle}
              syncing={lmsSyncing}
              connecting={lmsSyncing}
            />

            <LinkedPlatformCard
              name="GitHub"
              description="Development work and project evidence."
              icon={Github}
              iconClassName="bg-[#0f172a] text-white"
              active={!!ghConn}
              metaIcon={Code2}
              metaLabel={`${ghProjects.length} repositor${ghProjects.length === 1 ? "y" : "ies"}`}
              lastSync={githubLastSync}
              primaryLabel={ghConn ? "View Repositories" : "Connect GitHub"}
              onPrimary={ghConn ? () => scrollToRecords("repos") : () => void connectGithub()}
              onConnect={() => void connectGithub()}
              onSync={() => void syncGithub()}
              onDisconnect={handleDisconnectGithub}
              syncing={syncing}
              connecting={connecting}
            />
          </div>
        </section>

        {moodleError ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {moodleError}
          </p>
        ) : null}

        <IntegrationsEvidenceTabs
          activities={moodleActivities}
          lmsLoading={moodleLoading}
          projects={ghProjects}
          githubLoading={loading}
          declaredSkills={declaredSkillRefs}
          tab={recordsTab}
          onTabChange={setRecordsTab}
          onOpenSkill={(id) => navigate(`/learner/validation/${id}`)}
          onLinkSkill={handleLinkRepo}
        />
      </div>

      <ConfirmDestructiveDialog
        open={disconnectTarget === "github"}
        onOpenChange={(open) => { if (!open) setDisconnectTarget(null); }}
        title="Disconnect GitHub?"
        description="This removes your GitHub connection and clears synced repositories and activities from this view. You can reconnect anytime."
        confirmLabel="Disconnect GitHub"
        onConfirm={confirmDisconnect}
        loading={disconnecting}
      />
      <ConfirmDestructiveDialog
        open={disconnectTarget === "moodle"}
        onOpenChange={(open) => { if (!open) setDisconnectTarget(null); }}
        title="Disconnect Moodle?"
        description="Your Moodle connection will be removed. Previously imported LMS activity stays in your evidence history."
        confirmLabel="Disconnect Moodle"
        onConfirm={confirmDisconnect}
        loading={disconnecting}
      />
    </LearnerWorkspaceShell>
  );
}
