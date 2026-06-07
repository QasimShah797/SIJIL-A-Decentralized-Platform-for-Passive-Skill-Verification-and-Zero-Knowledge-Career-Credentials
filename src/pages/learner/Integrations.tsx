import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/sijil/AppShell";
import { PageHeader } from "@/components/sijil/PageHeader";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, Github, BookOpen, FileUp, Link2, ExternalLink, Unplug, FolderSync, Code2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useDeclaredSkills, useCredentials } from "@/hooks/useLearnerData";
import {
  fetchLmsEvidence, getLmsConnection, syncOdoo, uploadAndParseTranscript, toCardEvidence, type CustEvidence,
} from "@/lib/cust-lms";
import {
  startGitHubOAuth, syncGitHubPortfolio, disconnectGitHub, linkRepoToSkill,
  buildSkillsForGitHubSync,
} from "@/lib/github-integration";

// Combine declared skills with skills present in wallet credentials
function buildAllSkills(
  declared: { id: string; name: string }[],
  creds: { skill: string }[],
): { id: string; name: string }[] {
  return buildSkillsForGitHubSync(declared, creds);
}

function matchSkillByLanguage(lang: string | null, allSkills: { id: string; name: string }[]) {
  if (!lang) return null;
  const l = lang.toLowerCase();
  return (
    allSkills.find((s) => {
      const n = s.name.toLowerCase();
      return n === l || n.includes(l) || l.includes(n.split(/[ .&+/]/)[0]);
    }) ?? null
  );
}

type GhConn = {
  github_username: string;
  github_avatar_url: string | null;
  scopes: string | null;
  connected_at: string;
  last_synced_at: string | null;
};
type GhActivity = {
  id: string;
  github_username: string;
  repo_name: string | null;
  activity_type: string;
  activity_title: string;
  activity_url: string | null;
  commit_hash: string | null;
  occurred_at: string | null;
  synced_at: string;
};
type GhRepo = {
  id: string;
  repo_id: number;
  repo_name: string;
  full_name: string;
  github_url: string;
  description: string | null;
  primary_language: string | null;
  last_updated: string | null;
  commit_count: number | null;
  linked_skill_id: string | null;
  linked_skill_name: string | null;
};

export default function Integrations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { skills: declaredSkills } = useDeclaredSkills();
  const { credentials } = useCredentials();
  const allSkills = buildAllSkills(declaredSkills, credentials);
  const [ghConn, setGhConn] = useState<GhConn | null>(null);
  const [ghActivities, setGhActivities] = useState<GhActivity[]>([]);
  const [ghRepos, setGhRepos] = useState<GhRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const autoSyncAttempted = useRef(false);

  const [lmsConnected, setLmsConnected] = useState(false);
  const [lmsLastSync, setLmsLastSync] = useState<string | null>(null);
  const [lmsRecords, setLmsRecords] = useState<CustEvidence[]>([]);
  const [lmsSyncing, setLmsSyncing] = useState(false);

  const loadLms = async () => {
    try {
      const conn = await getLmsConnection();
      setLmsConnected(!!conn);
      setLmsLastSync(conn?.last_synced_at ? new Date(conn.last_synced_at).toLocaleString() : null);
      const evidence = await fetchLmsEvidence();
      setLmsRecords(evidence.map(toCardEvidence));
    } catch {
      setLmsConnected(false);
      setLmsRecords([]);
    }
  };

  const loadGitHub = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: conn }, { data: acts }, { data: repos }] = await Promise.all([
      supabase
        .from("github_connections_public")
        .select("github_username,github_avatar_url,scopes,connected_at,last_synced_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("github_activities")
        .select("*")
        .eq("user_id", user.id)
        .order("occurred_at", { ascending: false, nullsFirst: false })
        .limit(50),
      supabase
        .from("github_repos")
        .select("*")
        .eq("user_id", user.id)
        .order("last_updated", { ascending: false, nullsFirst: false }),
    ]);
    setGhConn(conn as GhConn | null);
    setGhActivities((acts ?? []) as GhActivity[]);
    setGhRepos((repos ?? []) as GhRepo[]);
    setLoading(false);
  };

  useEffect(() => {
    loadGitHub();
    loadLms();
  }, [user]); // eslint-disable-line

  const connectGithub = async () => {
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in before connecting GitHub.", variant: "destructive" });
      return;
    }
    setConnecting(true);
    try {
      const url = await startGitHubOAuth();
      window.location.href = url;
    } catch (e) {
      toast({ title: "Could not start GitHub OAuth", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      setConnecting(false);
    }
  };

  const syncGithub = async () => {
    setSyncing(true);
    try {
      const result = await syncGitHubPortfolio(allSkills);
      toast({
        title: "GitHub sync completed",
        description: `${result.synced} activities, ${result.repos} repos, ${result.contributors} contributors imported.`,
      });
      await loadGitHub();
    } catch (e) {
      toast({ title: "Sync failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!user || loading || syncing || autoSyncAttempted.current || !ghConn) return;
    if (ghRepos.length === 0 && ghActivities.length === 0) {
      autoSyncAttempted.current = true;
      void syncGithub();
    }
  }, [user, loading, ghConn, ghRepos.length, ghActivities.length, syncing]); // eslint-disable-line

  const disconnectGithub = async () => {
    if (!user) return;
    if (!confirm("Disconnect GitHub and remove all synced GitHub activities and repositories?")) return;
    await disconnectGitHub(user.id);
    setGhConn(null);
    setGhActivities([]);
    setGhRepos([]);
    toast({ title: "GitHub disconnected" });
  };

  const handleLinkRepo = async (repoId: string, skillId: string | null, skillName: string | null) => {
    try {
      await linkRepoToSkill(repoId, skillId, skillName);
      await loadGitHub();
      toast({ title: skillId ? "Repository linked to skill" : "Repository unlinked" });
    } catch (e) {
      toast({ title: "Could not update link", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const connectLms = async () => {
    const url = prompt("Odoo URL (e.g. https://your-school.odoo.com)");
    const db = prompt("Odoo database name");
    const login = prompt("Odoo login email");
    const apiKey = prompt("Odoo API key");
    if (!url || !db || !login || !apiKey) return;
    setLmsSyncing(true);
    try {
      await syncOdoo({ odoo_url: url, odoo_db: db, odoo_login: login, odoo_api_key: apiKey });
      await loadLms();
      toast({ title: "LMS connected and synced" });
    } catch (e) {
      toast({ title: "LMS connection failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setLmsSyncing(false);
    }
  };
  const syncLms = async () => {
    setLmsSyncing(true);
    try {
      const conn = await getLmsConnection();
      if (!conn?.odoo_url || !conn.odoo_db || !conn.odoo_login) {
        toast({ title: "LMS not configured", description: "Connect LMS first with Odoo credentials.", variant: "destructive" });
        return;
      }
      const apiKey = prompt("Enter Odoo API key to sync");
      if (!apiKey) return;
      await syncOdoo({
        odoo_url: conn.odoo_url,
        odoo_db: conn.odoo_db,
        odoo_login: conn.odoo_login,
        odoo_api_key: apiKey,
      });
      await loadLms();
      toast({ title: "LMS sync completed", description: `${lmsRecords.length} records loaded.` });
    } catch (e) {
      toast({ title: "LMS sync failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setLmsSyncing(false);
    }
  };
  const disconnectLms = async () => {
    if (!confirm("Disconnect LMS?")) return;
    if (user) {
      await supabase.from("lms_evidence").delete().eq("user_id", user.id);
      await supabase.from("lms_connections").delete().eq("user_id", user.id);
    }
    setLmsConnected(false);
    setLmsRecords([]);
    setLmsLastSync(null);
    toast({ title: "LMS disconnected" });
  };

  const syncPortfolio = async () => {
    if (ghConn) await syncGithub();
    if (lmsConnected) await syncLms();
    if (!ghConn && !lmsConnected) {
      toast({ title: "Nothing to sync", description: "Connect LMS or GitHub first." });
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
        {/* LMS card */}
        <IntegrationCard
          icon={BookOpen}
          name="LMS"
          connected={lmsConnected}
          lastSync={lmsLastSync}
          records={lmsRecords.length}
          onConnect={connectLms}
          onSync={syncLms}
          onDisconnect={disconnectLms}
          syncing={lmsSyncing}
          connectLabel="Connect LMS"
        />

        {/* GitHub card */}
        <IntegrationCard
          icon={Github}
          name="GitHub"
          connected={!!ghConn}
          account={ghConn ? `@${ghConn.github_username}` : undefined}
          lastSync={ghConn?.last_synced_at ? new Date(ghConn.last_synced_at).toLocaleString() : (ghConn ? "Not synced yet" : null)}
          records={ghActivities.length}
          onConnect={connectGithub}
          onSync={syncGithub}
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

      {/* GitHub Repositories */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Code2 className="h-4 w-4" /> GitHub Repositories
          </CardTitle>
          {ghConn && ghRepos.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {ghRepos.length} repositories · {ghRepos.filter((r) => r.linked_skill_id || matchSkillByLanguage(r.primary_language, allSkills)).length} linked to skills
            </span>
          )}
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
          ) : ghRepos.length === 0 ? (
            <EmptyState
              icon={Github}
              title="No GitHub repositories found"
              hint="Run a sync to import your repositories."
              action={
                <Button size="sm" variant="outline" onClick={syncGithub} disabled={syncing}>
                  <RefreshCw className={"h-3.5 w-3.5 mr-1.5 " + (syncing ? "animate-spin" : "")} />Sync now
                </Button>
              }
            />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {ghRepos.map((r) => (
                <RepoCard
                  key={r.id}
                  repo={r}
                  allSkills={allSkills}
                  onLinkSkill={handleLinkRepo}
                  onOpenSkill={(id) => navigate(id.startsWith("wallet-") ? "/learner/wallet" : `/learner/validation/${id}`)}
                />
              ))}
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
              title="Connect LMS to import recent activity"
              hint="Assignments, quizzes, and module completions will appear here."
              action={<Button size="sm" onClick={connectLms}><Link2 className="h-4 w-4 mr-1.5" />Connect LMS</Button>}
            />
          ) : lmsRecords.length === 0 ? (
            <EmptyState icon={BookOpen} title="No LMS activity synced yet" hint="Run a sync to import your latest LMS records." />
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

      {/* Recent GitHub Activity */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Github className="h-4 w-4" /> Recent GitHub Activity
          </CardTitle>
          {ghConn && (
            <span className="text-xs text-muted-foreground">@{ghConn.github_username} · {ghActivities.length} records</span>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">Loading…</div>
          ) : !ghConn ? (
            <EmptyState
              icon={Github}
              title="Connect GitHub to import recent activity"
              hint="Repos, commits, and pull requests will be pulled in as supporting records."
              action={<Button size="sm" onClick={connectGithub} disabled={connecting}><Github className="h-4 w-4 mr-1.5" />Connect GitHub</Button>}
            />
          ) : ghActivities.length === 0 ? (
            <EmptyState
              icon={Github}
              title="No GitHub activity synced yet"
              action={
                <Button size="sm" variant="outline" onClick={syncGithub} disabled={syncing}>
                  <RefreshCw className={"h-3.5 w-3.5 mr-1.5 " + (syncing ? "animate-spin" : "")} />Sync now
                </Button>
              }
            />
          ) : (
            <div className="divide-y">
              {ghActivities.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    if (a.activity_url) window.open(a.activity_url, "_blank", "noreferrer");
                    else navigate("/learner/validation/sk-001");
                  }}
                  className="w-full grid grid-cols-12 items-center gap-4 px-6 py-3.5 hover:bg-muted/40 text-left transition"
                >
                  <div className="col-span-2 text-xs text-muted-foreground capitalize">{a.activity_type.replace("_", " ")}</div>
                  <div className="col-span-6 text-sm font-medium truncate">{a.activity_title}</div>
                  <div className="col-span-2 text-xs text-muted-foreground truncate">{a.repo_name ?? "—"}</div>
                  <div className="col-span-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                    {a.occurred_at ? new Date(a.occurred_at).toLocaleDateString() : ""}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </div>
                </button>
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
  icon: Icon, name, account, connected, lastSync, records, onConnect, onSync, onDisconnect, connecting, syncing, connectLabel,
}: {
  icon: any; name: string; account?: string; connected: boolean;
  lastSync: string | null; records: number;
  onConnect: () => void; onSync: () => void; onDisconnect: () => void;
  connecting?: boolean; syncing?: boolean; connectLabel: string;
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
                {syncing ? "Syncing…" : "Sync"}
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

function RepoCard({
  repo, allSkills, onLinkSkill, onOpenSkill,
}: {
  repo: GhRepo;
  allSkills: { id: string; name: string }[];
  onLinkSkill: (repoId: string, skillId: string | null, skillName: string | null) => void;
  onOpenSkill: (skillId: string) => void;
}) {
  const fallback = !repo.linked_skill_id ? matchSkillByLanguage(repo.primary_language, allSkills) : null;
  const linkedId = repo.linked_skill_id ?? fallback?.id ?? null;
  const linkedName = repo.linked_skill_name ?? fallback?.name ?? null;
  const linked = !!linkedId;
  return (
    <div className="rounded-lg border bg-card p-4 hover:shadow-sm transition flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <a
            href={repo.github_url}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-sm hover:underline inline-flex items-center gap-1 truncate"
          >
            {repo.repo_name}
            <ExternalLink className="h-3 w-3 opacity-60 shrink-0" />
          </a>
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{repo.full_name}</div>
        </div>
        <StatusBadge variant={linked ? "verified" : "neutral"}>
          {linked ? "Evidence Linked" : "Unlinked"}
        </StatusBadge>
      </div>

      {repo.description && (
        <div className="text-xs text-muted-foreground mb-3 line-clamp-2">{repo.description}</div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-primary/70" />
          {repo.primary_language ?? "Language not detected"}
        </span>
        {typeof repo.commit_count === "number" && (
          <span>{repo.commit_count} commits</span>
        )}
        {repo.last_updated && (
          <span>Updated {new Date(repo.last_updated).toLocaleDateString()}</span>
        )}
      </div>

      <div className="mt-3">
        <label className="text-[11px] text-muted-foreground">Link to skill</label>
        <select
          className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={linkedId ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            if (!val) onLinkSkill(repo.id, null, null);
            else {
              const skill = allSkills.find((s) => s.id === val);
              onLinkSkill(repo.id, val, skill?.name ?? null);
            }
          }}
        >
          <option value="">— Not linked —</option>
          {allSkills.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {linked && linkedId && (
        <button
          onClick={() => onOpenSkill(linkedId)}
          className="mt-2 text-xs text-primary hover:underline text-left"
        >
          → View validation trail: {linkedName}
        </button>
      )}
    </div>
  );
}
