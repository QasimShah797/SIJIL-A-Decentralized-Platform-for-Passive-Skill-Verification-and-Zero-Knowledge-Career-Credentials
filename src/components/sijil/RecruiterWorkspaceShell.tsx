import { ZKP_UI_ENABLED } from "@/lib/zkp-ui";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { VerificationBell } from "@/components/zkp/VerificationBell";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  CalendarClock,
  BadgeCheck,
  UserCircle,
  LogOut,
  Menu,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useRecruiterProfile } from "@/hooks/useRecruiterProfile";
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

const SIDEBAR_STORAGE_KEY = "sijil-recruiter-sidebar-collapsed";

type ShellVariant = "dashboard" | "profile";

type NavItem = {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  match?: (pathname: string) => boolean;
};

type NavGroup = { label: string; items: NavItem[] };

function recruiterNav(dashboardLayout: boolean): NavGroup[] {
  return [
    {
      label: "Overview",
      items: [
        {
          to: "/recruiter/dashboard",
          icon: LayoutDashboard,
          label: "Dashboard",
          match: (p) => p === "/recruiter/dashboard" || p === "/recruiter",
        },
      ],
    },
    {
      label: dashboardLayout ? "Account" : "Profile",
      items: [
        {
          to: "/recruiter/profile",
          icon: UserCircle,
          label: "My Profile",
          match: (p) => p.startsWith("/recruiter/profile"),
        },
      ],
    },
    {
      label: dashboardLayout ? "Recruitment" : "Talent",
      items: [
        { to: "/recruiter/search", icon: Users, label: dashboardLayout ? "Shared Profiles" : "Directory" },
        { to: "/recruiter/jobs", icon: Briefcase, label: "Jobs" },
        { to: "/recruiter/interviews", icon: CalendarClock, label: "Interviews" },
        ...(dashboardLayout ? [{ to: "/recruiter/compare", icon: BadgeCheck, label: "Compare Candidates" }] : []),
      ],
    },
    ...(!dashboardLayout ? [{
      label: "Review",
      items: [{ to: "/recruiter/compare", icon: BadgeCheck, label: "Compare" }],
    }] : []),
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
  profileName,
  profileSubtitle,
  profileAvatar,
  profileAvatarUrl,
  onNavigate,
  onSignOut,
  onToggleCollapse,
}: {
  groups: NavGroup[];
  pathname: string;
  isDark: boolean;
  collapsed: boolean;
  profileName: string;
  profileSubtitle: string;
  profileAvatar: string;
  profileAvatarUrl: string | null;
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
          "shrink-0 border-b",
          collapsed ? "px-2 py-4" : "px-4 py-5",
          isDark ? "border-white/10" : "border-[#e2e8f0]",
        )}
      >
        <NavLink
          to="/recruiter/profile"
          onClick={onNavigate}
          title={collapsed ? profileName : undefined}
          className={cn(
            "flex items-center rounded-2xl transition-colors",
            collapsed ? "justify-center" : "gap-3",
            isDark ? "hover:bg-white/10" : "hover:bg-[#f8fafc]",
          )}
        >
          <span
            className={cn(
              "inline-flex shrink-0 overflow-hidden rounded-full ring-2 ring-offset-2",
              collapsed ? "h-10 w-10" : "h-[4.25rem] w-[4.25rem]",
              isDark
                ? "ring-white/80 ring-offset-[#023E8A] shadow-[0_8px_20px_rgba(0,0,0,0.18)]"
                : "ring-[#023E8A] ring-offset-white shadow-[0_8px_18px_rgba(2,62,138,0.18)]",
            )}
          >
            {profileAvatarUrl ? (
              <img src={profileAvatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-[#012A5C] text-sm font-semibold text-white">
                {profileAvatar}
              </span>
            )}
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className={cn("block truncate text-sm font-semibold", isDark ? "text-white" : "text-[#0f172a]")}>
                {profileName}
              </span>
              <span className={cn("mt-0.5 block text-[11px]", isDark ? "text-white/65" : "text-[#64748b]")}>
                {profileSubtitle}
              </span>
            </span>
          )}
        </NavLink>
      </div>

      <div
        className={cn(
          "learner-sidebar-scroll flex-1 px-2 py-4",
          !isDark && "learner-sidebar-scroll-light",
        )}
      >
        {groups.map((group) => (
          <div key={group.label} className={cn("mb-4", collapsed && "mb-3")}>
            {!collapsed && group.label !== "Overview" && (
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
          <p className="relative z-10 text-sm font-semibold leading-snug text-white">Verified Talent Pipeline</p>
          <p className="relative z-10 mt-1.5 max-w-[85%] text-xs leading-relaxed text-white/65">
            Discover skills. Trust evidence. Hire with confidence.
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

export function RecruiterWorkspaceShell({
  variant = "dashboard",
  children,
  rightRail,
  dashboardLayout = false,
}: {
  variant?: ShellVariant;
  children: ReactNode;
  rightRail?: ReactNode;
  dashboardLayout?: boolean;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile } = useRecruiterProfile(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
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
  const groups = recruiterNav(dashboardLayout);

  const handleSignOut = () => {
    void signOut().then(() => navigate("/login/recruiter"));
  };

  const toggleSidebar = () => setSidebarCollapsed((c) => !c);

  const profileName = profile?.fullName?.trim() || user?.email?.split("@")[0] || "Recruiter";
  const profileSubtitle = profile?.jobTitle?.trim() || "Recruiter profile";
  const profileAvatar = profile?.initials || user?.email?.slice(0, 2).toUpperCase() || "RC";
  const profileAvatarUrl = profile?.avatarUrl ?? null;

  const sidebarProps = {
    groups,
    pathname,
    isDark,
    collapsed: sidebarCollapsed,
    profileName,
    profileSubtitle,
    profileAvatar,
    profileAvatarUrl,
    onNavigate: () => setDrawerOpen(false),
    onSignOut: handleSignOut,
    onToggleCollapse: toggleSidebar,
  };

  const sidebar = <SidebarContent {...sidebarProps} />;

  return (
    <div className={cn("flex min-h-screen w-full flex-col", isDark ? "learner-shell-dashboard" : "learner-shell-profile", dashboardLayout && "recruiter-dashboard-shell")}>
      <header
        className={cn(
          "sticky top-0 z-40 flex h-16 w-full shrink-0 items-center",
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

        <div
          className={cn(
            "flex h-full shrink-0 items-center gap-3 px-4",
            sidebarCollapsed ? "md:w-[4.5rem] md:justify-center md:px-2" : "md:w-[260px] md:px-5",
          )}
        >
          <NavLink to="/recruiter/dashboard" className="flex min-w-0 items-center gap-3" aria-label="SIJIL home">
            <img src={sijilLogo} alt="" className="h-11 w-11 shrink-0 object-contain" />
            <span className={cn(
              "truncate text-xl font-bold tracking-tight",
              sidebarCollapsed && "md:hidden",
              isDark ? "text-[#023E8A]" : "text-[#0f172a]",
            )}>
              SIJIL
            </span>
          </NavLink>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-3 pl-3 pr-4 sm:pl-6 sm:pr-6">
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {ZKP_UI_ENABLED && <VerificationBell role="recruiter" />}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="hidden items-center gap-2 rounded-xl border border-[#e2e8f0] bg-white py-1 pl-1 pr-2 sm:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#023E8A]"
                  aria-label="Account menu"
                >
                  {profileAvatarUrl ? (
                    <img src={profileAvatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#023E8A] text-xs font-semibold text-white">
                      {profileAvatar}
                    </div>
                  )}
                  <div className="min-w-0 text-left">
                    <p className="truncate text-xs font-semibold text-[#023E8A]">{profileName}</p>
                    <p className="text-[10px] text-[#64748b]">Recruiter</p>
                  </div>
                  <ChevronDown className="h-4 w-4 shrink-0 text-[#64748b]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate("/recruiter/profile")}>My Profile</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/recruiter/dashboard")}>Dashboard</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "learner-sidebar-panel sticky top-16 z-30 hidden h-[calc(100vh-4rem)] shrink-0 md:flex md:flex-col",
            sidebarCollapsed ? "w-[4.5rem]" : "w-[260px]",
            isDark ? "learner-sidebar-dark" : "learner-sidebar-light",
          )}
        >
          <div className="flex h-full flex-col overflow-hidden">{sidebar}</div>
        </aside>
        <div className="learner-main-scroll min-w-0 flex-1 overflow-auto p-4 sm:p-6 lg:p-8">{children}</div>
        {rightRail ? (
          <aside className="learner-main-scroll hidden w-[320px] shrink-0 space-y-4 overflow-auto border-l border-[#e2e8f0] bg-[#f8fafc] p-6 lg:block">
            {rightRail}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
