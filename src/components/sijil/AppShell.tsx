import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  LayoutDashboard,
  UserCircle,
  Plug,
  ClipboardCheck,
  ShieldCheck,
  Wallet,
  Search,
  Bell,
  BadgeCheck,
  MessageSquare,
  LogOut,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Role, getDecayingSkills } from "@/lib/sijil-data";
import { useAuth } from "@/hooks/useAuth";
import { useLearnerProfile, useDeclaredSkills } from "@/hooks/useLearnerData";
import { ThemeToggle } from "@/components/sijil/ThemeToggle";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import sijilLogo from "@/assets/sijil-logo.png";

type NavItem = { to: string; icon: React.ComponentType<{ className?: string }>; label: string; mobileTab?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const recruiterNavGroups: NavGroup[] = [
  {
    label: "Search",
    items: [{ to: "/recruiter/search", icon: Search, label: "Search Candidates", mobileTab: true }],
  },
  {
    label: "Compare",
    items: [{ to: "/recruiter/compare", icon: BadgeCheck, label: "Compare Candidates", mobileTab: true }],
  },
];

function useLearnerNav(): NavGroup[] {
  return [
    {
      label: "Overview",
      items: [{ to: "/learner/profile", icon: LayoutDashboard, label: "Dashboard", mobileTab: true }],
    },
    {
      label: "Profile",
      items: [{ to: "/learner/my-profile", icon: UserCircle, label: "My Profile" }],
    },
    {
      label: "Evidence",
      items: [{ to: "/learner/integrations", icon: Plug, label: "Integrations", mobileTab: true }],
    },
    {
      label: "Assessment",
      items: [
        { to: "/learner/task", icon: ClipboardCheck, label: "Practical Task", mobileTab: true },
        { to: "/learner/validation", icon: ShieldCheck, label: "Validation Trail", mobileTab: true },
      ],
    },
    {
      label: "Identity",
      items: [
        { to: "/learner/wallet", icon: Wallet, label: "Wallet", mobileTab: true },
        { to: "/learner/peer-reviews", icon: MessageSquare, label: "Peer Reviews" },
      ],
    },
  ];
}

function navActive(pathname: string, to: string) {
  return pathname.startsWith(to.split("/").slice(0, 3).join("/"));
}

function SidebarLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = navActive(pathname, item.to);
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
        active
          ? "bg-primary/10 font-medium text-primary shadow-sm"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
      )}
    >
      <item.icon className="h-4 w-4 shrink-0 opacity-80" />
      {item.label}
    </NavLink>
  );
}

function NavGroupSection({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="mb-5">
      <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
        {group.label}
      </p>
      <nav className="space-y-0.5">
        {group.items.map((item) => (
          <SidebarLink key={item.to} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </nav>
    </div>
  );
}

function MobileBottomTabs({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border/60 bg-card/95 backdrop-blur-md lg:hidden"
      aria-label="Mobile navigation"
    >
      {items.map((item) => {
        const active = navActive(pathname, item.to);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <item.icon className="h-5 w-5 shrink-0" aria-hidden />
            <span className="truncate">{item.label.split(" ")[0]}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

function SidebarBrand() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sidebar-border bg-card p-1 shadow-sm">
        <img src={sijilLogo} alt="SIJIL logo" className="h-full w-full object-contain" />
      </div>
      <div>
        <div className="font-semibold leading-tight text-sidebar-accent-foreground">SIJIL</div>
      </div>
    </div>
  );
}

export function AppShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile } = useLearnerProfile();
  const { skills } = useDeclaredSkills();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const roleLabel = role === "learner" ? "Learner" : "Recruiter";

  const learnerGroups = useLearnerNav();
  const recruiterGroups = recruiterNavGroups;

  const mobileTabItems: NavItem[] =
    role === "learner"
      ? learnerGroups.flatMap((g) => g.items).filter((i) => i.mobileTab)
      : recruiterGroups.flatMap((g) => g.items).filter((i) => i.mobileTab);

  const decayCount = role === "learner" ? getDecayingSkills(skills).length : 0;
  const avatar =
    role === "learner"
      ? (profile?.avatar ?? "?")
      : (user?.email?.slice(0, 2).toUpperCase() ?? "RC");
  const didShort = profile?.did ? `${profile.did.slice(0, 12)}…${profile.did.slice(-4)}` : "";

  const handleSignOut = () => {
    void signOut().then(() =>
      navigate(role === "recruiter" ? "/login/recruiter" : "/"),
    );
  };

  const sidebarContent = (
    <>
      <div className="border-b border-sidebar-border px-5 py-5">
        <div className="text-[11px] text-sidebar-foreground/60">{roleLabel} workspace</div>
        <div className="mt-2">
          <SidebarBrand />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {role === "learner" ? (
          learnerGroups.map((group) => (
            <NavGroupSection
              key={group.label}
              group={group}
              pathname={pathname}
              onNavigate={() => setDrawerOpen(false)}
            />
          ))
        ) : (
          recruiterGroups.map((group) => (
            <NavGroupSection
              key={group.label}
              group={group}
              pathname={pathname}
              onNavigate={() => setDrawerOpen(false)}
            />
          ))
        )}
      </div>
      <div className="border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/70"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 z-30 hidden h-screen w-[17.5rem] shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[inset_-1px_0_0_hsl(var(--border)/0.4)] lg:flex">
        {sidebarContent}
      </aside>

      <main className="flex min-h-screen min-w-0 flex-1 flex-col pb-16 lg:pb-0">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/60 bg-card/80 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-2">
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl lg:hidden" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 bg-sidebar text-sidebar-foreground">
                <SheetHeader className="sr-only">
                  <SheetTitle>Navigation</SheetTitle>
                </SheetHeader>
                <div className="flex h-full flex-col">{sidebarContent}</div>
              </SheetContent>
            </Sheet>
            <div className="text-sm">
              <span className="font-semibold text-foreground">{roleLabel}</span>
              <span className="hidden text-muted-foreground sm:inline"> · Verification workspace</span>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            {role === "learner" && decayCount > 0 && (
              <button
                onClick={() => navigate("/learner/profile#notifications")}
                className="relative flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-muted/60"
                aria-label={`${decayCount} competency notifications`}
              >
                <Bell className="h-4 w-4" />
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                  {decayCount}
                </span>
              </button>
            )}
            {didShort && (
              <span className="mono hidden text-xs text-muted-foreground md:inline">{didShort}</span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Account menu"
                >
                  {role === "learner" && profile?.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt=""
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {avatar}
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {role === "learner" && (
                  <>
                    <DropdownMenuItem onClick={() => navigate("/learner/my-profile")}>
                      My Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/learner/profile#notifications")}>
                      Notifications
                      {decayCount > 0 && ` (${decayCount})`}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div className="workspace-content flex-1 animate-fade-in p-4 sm:p-6 lg:p-8">{children}</div>
      </main>

      <MobileBottomTabs items={mobileTabItems} pathname={pathname} />
    </div>
  );
}
