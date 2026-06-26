import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, User, Plug, ClipboardCheck, ShieldCheck,
  Wallet, Search, Building2, Sparkles, Bell, BadgeCheck, MessageSquare, LogOut, GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Role, getDecayingSkills } from "@/lib/sijil-data";
import { useAuth } from "@/hooks/useAuth";
import { useLearnerProfile, useDeclaredSkills } from "@/hooks/useLearnerData";
import sijilLogo from "@/assets/sijil-logo.png";

const recruiterNav = [
  { to: "/recruiter/search", icon: Search, label: "Search Candidates" },
  { to: "/recruiter/compare", icon: BadgeCheck, label: "Compare" },
];
const institutionNav = [
  { to: "/institution/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/institution/students", icon: GraduationCap, label: "Student Management" },
  { to: "/institution/queue", icon: ClipboardCheck, label: "Attestation Queue" },
];

export function AppShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile } = useLearnerProfile();
  const { skills } = useDeclaredSkills();
  const roleLabel = role === "learner" ? "Learner" : role === "recruiter" ? "Recruiter" : "Institution";

  const learnerNav = [
    { to: "/learner/profile", icon: User, label: "Profile & Skills" },
    { to: "/learner/integrations", icon: Plug, label: "Integrations" },
    { to: "/learner/task", icon: ClipboardCheck, label: "Practical Task" },
    ...(skills.length ? [{ to: "/learner/validation", icon: ShieldCheck, label: "Validation Trail" }] : []),
    { to: "/learner/wallet", icon: Wallet, label: "Wallet" },
    { to: "/learner/peer-reviews", icon: MessageSquare, label: "Peer Reviews" },
  ];
  const nav = role === "learner" ? learnerNav : role === "recruiter" ? recruiterNav : institutionNav;

  const decayCount = role === "learner" ? getDecayingSkills(skills).length : 0;
  const avatar = role === "learner"
    ? (profile?.avatar ?? "?")
    : role === "recruiter"
      ? (user?.email?.slice(0, 2).toUpperCase() ?? "RC")
      : "IN";
  const didShort = profile?.did ? `${profile.did.slice(0, 12)}…${profile.did.slice(-4)}` : "";

  return (
    <div className="min-h-screen flex w-full bg-gradient-to-b from-background to-muted/30">
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border sticky top-0 h-screen overflow-y-auto z-30">
        <div className="px-5 py-5 border-b border-sidebar-border sticky top-0 bg-sidebar z-10">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-md bg-white/95 flex items-center justify-center p-0.5 shadow-sm">
              <img src={sijilLogo} alt="SIJIL logo" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="text-sidebar-accent-foreground font-semibold leading-tight">SIJIL</div>
              <div className="text-[11px] text-sidebar-foreground/70">Decentralized Credentials</div>
            </div>
          </div>
        </div>

        <div className="px-3 py-3">
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-[11px] uppercase tracking-wider text-sidebar-foreground/60">{roleLabel}</span>
            <Sparkles className="h-3.5 w-3.5 text-sidebar-primary" />
          </div>
          <nav className="space-y-0.5">
            {nav.map((item) => {
              const active = pathname.startsWith(item.to.split("/").slice(0, 3).join("/"));
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-3 border-t border-sidebar-border text-xs text-sidebar-foreground/60 px-3 space-y-2">
          {(role === "institution" || role === "learner") && (
            <button
              type="button"
              onClick={() =>
                void signOut().then(() =>
                  navigate(role === "institution" ? "/login/institution" : "/"),
                )
              }
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent/60 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          )}
          {role !== "institution" && role !== "learner" && (
            <span>Authentication module is being rebuilt.</span>
          )}
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col min-h-screen">
        <header className="h-14 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between px-6 shadow-sm">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{roleLabel} workspace</span>
          </div>
          <div className="flex items-center gap-3">
            {role === "learner" && (
              <button
                onClick={() => navigate("/learner/profile#notifications")}
                className="relative h-8 w-8 rounded-md hover:bg-muted/60 flex items-center justify-center transition-colors"
                aria-label="Notifications"
                title="Notifications"
              >
                <Bell className="h-4 w-4" />
                {decayCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-[10px] font-semibold text-white flex items-center justify-center">
                    {decayCount}
                  </span>
                )}
              </button>
            )}
            {didShort && (
              <span className="hidden md:inline text-xs text-muted-foreground mono">{didShort}</span>
            )}
            <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
              {avatar}
            </div>
          </div>
        </header>
        <div className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
