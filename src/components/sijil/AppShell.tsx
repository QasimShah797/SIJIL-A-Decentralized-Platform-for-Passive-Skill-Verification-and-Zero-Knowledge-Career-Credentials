import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  User,
  UserCircle,
  Plug,
  ClipboardCheck,
  ShieldCheck,
  Wallet,
  Search,
  Building2,
  Bell,
  BadgeCheck,
  MessageSquare,
  LogOut,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Role, getDecayingSkills } from "@/lib/sijil-data";
import { useAuth } from "@/hooks/useAuth";
import { useLearnerProfile, useDeclaredSkills } from "@/hooks/useLearnerData";
import { ThemeToggle } from "@/components/sijil/ThemeToggle";
import sijilLogo from "@/assets/sijil-logo.png";

type NavItem = { to: string; icon: React.ComponentType<{ className?: string }>; label: string };
type NavGroup = { label: string; items: NavItem[] };

const recruiterNav: NavItem[] = [
  { to: "/recruiter/search", icon: Search, label: "Search Candidates" },
  { to: "/recruiter/compare", icon: BadgeCheck, label: "Compare" },
];

const institutionNav: NavItem[] = [
  { to: "/institution/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/institution/students", icon: GraduationCap, label: "Student Management" },
  { to: "/institution/queue", icon: ClipboardCheck, label: "Attestation Queue" },
];

function NavGroupSection({ group, pathname }: { group: NavGroup; pathname: string }) {
  return (
    <div className="mb-5">
      <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
        {group.label}
      </p>
      <nav className="space-y-0.5">
        {group.items.map((item) => {
          const active = pathname.startsWith(item.to.split("/").slice(0, 3).join("/"));
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0 opacity-80" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

function FlatNav({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <nav className="space-y-0.5">
      {items.map((item) => {
        const active = pathname.startsWith(item.to.split("/").slice(0, 3).join("/"));
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0 opacity-80" />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function AppShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile } = useLearnerProfile();
  const { skills } = useDeclaredSkills();
  const roleLabel = role === "learner" ? "Learner" : role === "recruiter" ? "Recruiter" : "Institution";

  const learnerGroups: NavGroup[] = [
    {
      label: "Profile",
      items: [
        { to: "/learner/profile", icon: User, label: "Competencies" },
        { to: "/learner/my-profile", icon: UserCircle, label: "My Profile" },
      ],
    },
    {
      label: "Evidence",
      items: [{ to: "/learner/integrations", icon: Plug, label: "Integrations" }],
    },
    {
      label: "Assessment",
      items: [
        { to: "/learner/task", icon: ClipboardCheck, label: "Practical Task" },
        ...(skills.length
          ? [{ to: "/learner/validation", icon: ShieldCheck, label: "Validation Trail" }]
          : []),
      ],
    },
    {
      label: "Identity",
      items: [
        { to: "/learner/wallet", icon: Wallet, label: "Wallet" },
        { to: "/learner/peer-reviews", icon: MessageSquare, label: "Peer Reviews" },
      ],
    },
  ];

  const decayCount = role === "learner" ? getDecayingSkills(skills).length : 0;
  const avatar =
    role === "learner"
      ? (profile?.avatar ?? "?")
      : role === "recruiter"
        ? (user?.email?.slice(0, 2).toUpperCase() ?? "RC")
        : "IN";
  const didShort = profile?.did ? `${profile.did.slice(0, 12)}…${profile.did.slice(-4)}` : "";

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="sticky top-0 z-30 flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="sticky top-0 z-10 border-b border-sidebar-border bg-sidebar px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sidebar-border bg-card p-1 shadow-sm">
              <img src={sijilLogo} alt="SIJIL logo" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="font-semibold leading-tight text-sidebar-accent-foreground">SIJIL</div>
              <div className="text-[11px] text-sidebar-foreground/60">{roleLabel} workspace</div>
            </div>
          </div>
        </div>

        <div className="flex-1 px-3 py-4">
          {role === "learner"
            ? learnerGroups.map((group) => (
                <NavGroupSection key={group.label} group={group} pathname={pathname} />
              ))
            : (
              <div className="mb-5">
                <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
                  {roleLabel}
                </p>
                <FlatNav
                  items={role === "recruiter" ? recruiterNav : institutionNav}
                  pathname={pathname}
                />
              </div>
            )}
        </div>

        <div className="space-y-2 border-t border-sidebar-border p-3 text-xs text-sidebar-foreground/60">
          <button
            type="button"
            onClick={() =>
              void signOut().then(() =>
                navigate(
                  role === "institution"
                    ? "/login/institution"
                    : role === "recruiter"
                      ? "/login/recruiter"
                      : "/",
                ),
              )
            }
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-sidebar-accent/70"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/60 bg-card/90 px-6 backdrop-blur-md">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{roleLabel}</span>
            <span className="hidden sm:inline"> · Verified skills workspace</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {role === "learner" && (
              <button
                onClick={() => navigate("/learner/profile#notifications")}
                className="relative flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-muted/60"
                aria-label="Notifications"
                title="Notifications"
              >
                <Bell className="h-4 w-4" />
                {decayCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                    {decayCount}
                  </span>
                )}
              </button>
            )}
            {didShort && (
              <span className="mono hidden text-xs text-muted-foreground md:inline">{didShort}</span>
            )}
            {role === "learner" && profile?.avatarUrl ? (
              <img
                key={profile.avatarUrl}
                src={profile.avatarUrl}
                alt={profile.name ?? "Profile"}
                className="h-9 w-9 rounded-full border object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {avatar}
              </div>
            )}
          </div>
        </header>
        <div className="mx-auto w-full max-w-7xl flex-1 animate-fade-in p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
