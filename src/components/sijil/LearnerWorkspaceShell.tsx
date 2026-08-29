import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  UserCircle,
  Plug,
  ShieldCheck,
  ClipboardCheck,
  Wallet,
  MessageSquare,
  LogOut,
  Menu,
  Search,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useLearnerProfile, useDeclaredSkills } from "@/hooks/useLearnerData";
import { getDecayingSkills } from "@/lib/sijil-data";
import { ThemeToggle } from "@/components/sijil/ThemeToggle";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import sijilLogo from "@/assets/sijil-logo.png";
import { IdentityCubesIllustration } from "@/components/learner/PromoIllustrations";

const SIDEBAR_STORAGE_KEY = "sijil-learner-sidebar-collapsed";

type ShellVariant = "dashboard" | "profile";

type NavItem = {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  match?: (pathname: string) => boolean;
};

type NavGroup = { label: string; items: NavItem[] };

function dashboardNav(skillsCount: number): NavGroup[] {
  return [
    {
      label: "Overview",
      items: [
        {
          to: "/learner/profile",
          icon: LayoutDashboard,
          label: "Dashboard",
          match: (p) => p === "/learner/profile" || p === "/learner/dashboard",
        },
      ],
    },
    {
      label: "Profile",
      items: [{ to: "/learner/my-profile", icon: UserCircle, label: "My Profile" }],
    },
    {
      label: "Evidence",
      items: [{ to: "/learner/integrations", icon: Plug, label: "Integrations" }],
    },
    {
      label: "Assessment",
      items: [
        { to: "/learner/task", icon: ClipboardCheck, label: "Practical Task" },
        ...(skillsCount
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
}

function profileNav(skillsCount: number): NavGroup[] {
  return [
    {
      label: "Overview",
      items: [
        {
          to: "/learner/profile",
          icon: LayoutDashboard,
          label: "Dashboard",
          match: (p) => p === "/learner/profile" || p === "/learner/dashboard",
        },
      ],
    },
    {
      label: "Profile",
      items: [
        {
          to: "/learner/my-profile",
          icon: UserCircle,
          label: "My Profile",
          match: (p) => p.startsWith("/learner/my-profile"),
        },
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
        ...(skillsCount
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
}

function isActive(pathname: string, item: NavItem) {
  if (item.match) return item.match(pathname);
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function SidebarNavLink({
  item,
  active,
  collapsed,
  isDark,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  isDark: boolean;
  onNavigate?: () => void;
}) {
  const link = (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center text-sm transition-all",
        collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
        isDark
          ? active
            ? "learner-nav-active-dark"
            : "learner-nav-link-dark"
          : active
            ? "learner-nav-active-light"
            : "rounded-xl text-[#334155] hover:bg-[#f1f5f9]",
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );

  if (!collapsed) return link;

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarContent({
  groups,
  pathname,
  isDark,
  collapsed,
  onNavigate,
  onSignOut,
  onToggleCollapse,
}: {
  groups: NavGroup[];
  pathname: string;
  isDark: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
  onSignOut: () => void;
  onToggleCollapse: () => void;
}) {
  const signOutBtn = (
    <button
      type="button"
      onClick={onSignOut}
      title={collapsed ? "Sign out" : undefined}
      className={cn(
        "flex w-full items-center rounded-xl text-left text-xs transition-colors",
        collapsed ? "justify-center px-2 py-2.5" : "gap-2 px-3 py-2",
        isDark ? "text-white/55 hover:bg-white/10 hover:text-white" : "text-[#64748b] hover:bg-[#f1f5f9]",
      )}
    >
      <LogOut className="h-3.5 w-3.5 shrink-0" />
      {!collapsed && "Sign out"}
    </button>
  );

  return (
    <>
      <div
        className={cn(
          "shrink-0 border-b py-4",
          collapsed ? "px-2" : "px-5 py-5",
          isDark ? "border-white/10" : "border-[#e2e8f0]",
        )}
      >
        <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3")}>
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl p-1",
              isDark ? "bg-white/10" : "border border-[#e2e8f0] bg-white shadow-sm",
            )}
          >
            <img src={sijilLogo} alt="" className="h-full w-full object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className={cn("text-base font-bold tracking-tight", isDark ? "text-white" : "text-[#023E8A]")}>
                SIJIL
              </div>
              {isDark && <p className="text-[10px] text-white/50">Build. Prove. Verify.</p>}
            </div>
          )}
        </div>
      </div>

      <div
        className={cn(
          "learner-sidebar-scroll flex-1 px-2 py-4",
          !isDark && "learner-sidebar-scroll-light",
        )}
      >
        {groups.map((group) => (
          <div key={group.label} className={cn("mb-4", collapsed && "mb-3")}>
            {!collapsed && (
              <p
                className={cn(
                  "mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest",
                  isDark ? "text-white/40" : "text-[#64748b]",
                )}
              >
                {group.label}
              </p>
            )}
            <nav className="space-y-0.5">
              {group.items.map((item) => (
                <SidebarNavLink
                  key={`${group.label}-${item.label}`}
                  item={item}
                  active={isActive(pathname, item)}
                  collapsed={collapsed}
                  isDark={isDark}
                  onNavigate={onNavigate}
                />
              ))}
            </nav>
          </div>
        ))}
      </div>

      {isDark && !collapsed && (
        <div className="learner-sidebar-promo relative mx-2 mb-2 shrink-0 overflow-hidden p-4 pb-16">
          <p className="relative z-10 text-sm font-semibold leading-snug text-white">Your Professional Identity</p>
          <p className="relative z-10 mt-1.5 max-w-[85%] text-xs leading-relaxed text-white/65">
            Build skills. Prove them. Verify them.
          </p>
          <div className="pointer-events-none absolute bottom-1 right-1 h-[4.5rem] w-[5.5rem]">
            <IdentityCubesIllustration />
          </div>
        </div>
      )}

      <div className={cn("shrink-0 space-y-1 p-2", isDark ? "border-t border-white/10" : "border-t border-[#e2e8f0]")}>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cn(
                "flex w-full items-center rounded-xl text-xs transition-colors",
                collapsed ? "justify-center px-2 py-2.5" : "gap-2 px-3 py-2",
                isDark
                  ? "text-white/55 hover:bg-white/10 hover:text-white"
                  : "text-[#64748b] hover:bg-[#f1f5f9]",
              )}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4 shrink-0" />
              ) : (
                <>
                  <ChevronLeft className="h-4 w-4 shrink-0" />
                  <span>Collapse menu</span>
                </>
              )}
            </button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right" className="text-xs">
              Expand menu
            </TooltipContent>
          )}
        </Tooltip>

        {collapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>{signOutBtn}</TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              Sign out
            </TooltipContent>
          </Tooltip>
        ) : (
          signOutBtn
        )}
      </div>
    </>
  );
}

export function LearnerWorkspaceShell({
  variant,
  children,
  rightRail,
}: {
  variant: ShellVariant;
  children: ReactNode;
  rightRail?: ReactNode;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile } = useLearnerProfile();
  const { skills } = useDeclaredSkills();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  const isDark = variant === "dashboard";
  const groups = isDark ? dashboardNav(skills.length) : profileNav(skills.length);
  const decayCount = getDecayingSkills(skills).length;
  const didShort = profile?.did ? `${profile.did.slice(0, 12)}…${profile.did.slice(-4)}` : "";

  const handleSignOut = () => {
    void signOut().then(() => navigate("/"));
  };

  const toggleSidebar = () => setSidebarCollapsed((c) => !c);

  const sidebarProps = {
    groups,
    pathname,
    isDark,
    collapsed: sidebarCollapsed,
    onNavigate: () => setDrawerOpen(false),
    onSignOut: handleSignOut,
    onToggleCollapse: toggleSidebar,
  };

  const sidebar = <SidebarContent {...sidebarProps} />;

  return (
    <div className={cn("flex min-h-screen w-full", isDark ? "learner-shell-dashboard" : "learner-shell-profile")}>
      <aside
        className={cn(
          "learner-sidebar-panel sticky top-0 z-30 hidden h-screen shrink-0 md:flex md:flex-col",
          sidebarCollapsed ? "w-[4.5rem]" : "w-[260px]",
          isDark ? "learner-sidebar-dark" : "learner-sidebar-light",
        )}
      >
        <div className="flex h-full flex-col overflow-hidden">{sidebar}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            "sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 px-4 sm:px-6",
            isDark ? "learner-dash-header" : "border-b border-[#e9e5e0] bg-white/90 backdrop-blur-md",
          )}
        >
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-xl md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className={cn(
                "learner-sidebar-scroll w-[260px] p-0",
                isDark ? "learner-sidebar-dark text-white" : "learner-sidebar-light",
              )}
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <div className="flex h-full flex-col">
                <SidebarContent {...sidebarProps} collapsed={false} />
              </div>
            </SheetContent>
          </Sheet>

          <Button
            variant="ghost"
            size="icon"
            className="hidden rounded-xl md:inline-flex"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </Button>

          {isDark ? (
            <div className="mx-auto hidden max-w-lg flex-1 sm:flex">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search competencies, evidence, credentials…"
                  className="learner-dash-search h-10 w-full pl-9 pr-16 text-sm outline-none focus:ring-2 focus:ring-[#023E8A]/30"
                />
                <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-[#e2e8f0] bg-white px-1.5 py-0.5 text-[10px] text-[#64748b] sm:inline">
                  Ctrl K
                </kbd>
              </div>
            </div>
          ) : (
            <div className="text-sm">
              <span className="font-semibold text-[#023E8A]">Learner</span>
              <span className="text-[#64748b]"> · Verification workspace</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />

            {decayCount > 0 && (
              <button
                type="button"
                onClick={() => navigate("/learner/profile#notifications")}
                className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1f5f9]"
                aria-label={`${decayCount} notifications`}
              >
                <Bell className="h-4 w-4 text-[#334155]" />
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                  {decayCount}
                </span>
              </button>
            )}

            {!isDark && didShort && (
              <span className="mono hidden text-xs text-[#64748b] md:inline">{didShort}</span>
            )}

            {isDark && profile && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="hidden items-center gap-2 rounded-xl border border-[#e2e8f0] bg-white py-1 pl-1 pr-2 sm:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#023E8A]"
                    aria-label="Account menu"
                  >
                    {profile.avatarUrl ? (
                      <img src={profile.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#023E8A] text-xs font-semibold text-white">
                        {profile.avatar}
                      </div>
                    )}
                    <div className="min-w-0 text-left">
                      <p className="truncate text-xs font-semibold text-[#023E8A]">{profile.name}</p>
                      <p className="text-[10px] text-[#64748b]">Learner</p>
                    </div>
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-[#ccfbf1] px-2 py-0.5 text-[10px] font-medium text-[#0f766e]">
                      <CheckCircle2 className="h-3 w-3" />
                      Verified
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => navigate("/learner/my-profile")}>My Profile</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/learner/profile")}>Dashboard</DropdownMenuItem>
                  {decayCount > 0 && (
                    <DropdownMenuItem onClick={() => navigate("/learner/profile#notifications")}>
                      Notifications ({decayCount})
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {!isDark && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#023E8A]"
                    aria-label="Account menu"
                  >
                    {profile?.avatarUrl ? (
                      <img
                        src={profile.avatarUrl}
                        alt=""
                        className="h-9 w-9 rounded-full border border-[#e2e8f0] object-cover"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#023E8A] text-xs font-semibold text-white">
                        {profile?.avatar ?? user?.email?.slice(0, 2).toUpperCase() ?? "?"}
                      </div>
                    )}
                    <ChevronDown className="h-4 w-4 text-[#64748b]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => navigate("/learner/my-profile")}>My Profile</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/learner/profile")}>Dashboard</DropdownMenuItem>
                  {decayCount > 0 && (
                    <DropdownMenuItem onClick={() => navigate("/learner/profile#notifications")}>
                      Notifications ({decayCount})
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="learner-main-scroll min-w-0 flex-1 overflow-auto p-4 sm:p-6 lg:p-8">{children}</div>
          {rightRail ? (
            <aside className="learner-main-scroll hidden w-[320px] shrink-0 space-y-4 overflow-auto border-l border-[#e2e8f0] bg-[#f8fafc] p-6 lg:block">
              {rightRail}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function greetingForTime(name: string) {
  const hour = new Date().getHours();
  const period = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return `Good ${period}, ${name}`;
}
