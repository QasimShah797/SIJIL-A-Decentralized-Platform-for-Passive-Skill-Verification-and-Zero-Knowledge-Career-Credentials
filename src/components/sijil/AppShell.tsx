import { ZKP_UI_ENABLED } from "@/lib/zkp-ui";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { VerificationBell } from "@/components/zkp/VerificationBell";
import { useState } from "react";
import {
  Briefcase,
  CalendarClock,
  CheckCircle2,
  LayoutDashboard,
  Users,
  UserCircle,
  Plug,
  ClipboardCheck,
  ShieldCheck,
  Wallet,
  BadgeCheck,
  MessageSquare,
  LogOut,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Role, getDecayingSkills } from "@/lib/sijil-data";
import { useAuth } from "@/hooks/useAuth";
import { useLearnerProfile, useDeclaredSkills } from "@/hooks/useLearnerData";
import { useRecruiterProfile } from "@/hooks/useRecruiterProfile";
import { recruiterVerificationLabel } from "@/lib/db/recruiter-profile";
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
    label: "Workspace",
    items: [
      { to: "/recruiter/dashboard", icon: LayoutDashboard, label: "Dashboard", mobileTab: true },
      { to: "/recruiter/search", icon: Users, label: "Directory" },
      { to: "/recruiter/jobs", icon: Briefcase, label: "Jobs", mobileTab: true },
      { to: "/recruiter/interviews", icon: CalendarClock, label: "Interviews", mobileTab: true },
    ],
  },
  {
    label: "Review",
    items: [
      { to: "/recruiter/compare", icon: BadgeCheck, label: "Compare", mobileTab: true },
    ],
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
      items: [{ to: "/learner/integrations", icon: Plug, label: "Connected Platforms", mobileTab: true }],
    },
    {
      label: "Assessment",
      items: [
        { to: "/learner/task", icon: ClipboardCheck, label: "Practical Task", mobileTab: true },
        { to: "/learner/validation", icon: ShieldCheck, label: "Competency Progress", mobileTab: true },
      ],
    },
    {
      label: "Identity",
      items: [
        { to: "/learner/wallet", icon: Wallet, label: "Wallet", mobileTab: true },
        { to: "/learner/peer-reviews", icon: MessageSquare, label: "Peer Reviews" },
        { to: "/learner/interviews", icon: CalendarClock, label: "Interviews" },
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
  tone = "default",
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
  tone?: "default" | "recruiter";
}) {
  const active = navActive(pathname, item.to);
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active
          ? tone === "recruiter"
            ? "bg-sijil-blue font-medium text-white shadow-sm"
            : "relative bg-white/15 font-medium text-sidebar-accent-foreground shadow-sm before:absolute before:left-0 before:top-2 before:h-[calc(100%-1rem)] before:w-1 before:rounded-full before:bg-sidebar-primary"
          : "text-sidebar-foreground/85 hover:bg-white/10 hover:text-sidebar-accent-foreground",
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
  tone = "default",
}: {
  group: NavGroup;
  pathname: string;
  onNavigate?: () => void;
  tone?: "default" | "recruiter";
}) {
  return (
    <div className="mb-5">
      <p className="mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.16em] text-sidebar-foreground/60">
        {group.label}
      </p>
      <nav className="space-y-0.5">
        {group.items.map((item) => (
          <SidebarLink key={item.to} item={item} pathname={pathname} onNavigate={onNavigate} tone={tone} />
        ))}
      </nav>
    </div>
  );
}

function MobileBottomTabs({
  items,
  pathname,
  account,
}: {
  items: NavItem[];
  pathname: string;
  account?: { to: string; initials: string; avatarUrl: string | null };
}) {
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
      {account ? (
        <NavLink
          to={account.to}
          className={cn(
            "flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] font-medium transition-colors",
            navActive(pathname, account.to) ? "text-primary" : "text-muted-foreground",
          )}
        >
          {account.avatarUrl ? (
            <img src={account.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover ring-2 ring-primary/20" />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sijil-blue text-[10px] font-semibold text-white">
              {account.initials}
            </span>
          )}
          <span className="truncate">Profile</span>
        </NavLink>
      ) : null}
    </nav>
  );
}

function RecruiterSidebarAccount({
  name,
  subtitle,
  initials,
  avatarUrl,
  active,
  onNavigate,
  onSignOut,
}: {
  name: string;
  subtitle: string;
  initials: string;
  avatarUrl: string | null;
  active: boolean;
  onNavigate?: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="border-t border-sidebar-border p-3">
      <div className={cn("flex items-center gap-2 rounded-2xl p-1.5", active && "bg-white/15")}>
        <NavLink
          to="/recruiter/profile"
          onClick={onNavigate}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 py-1 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-white/40" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-base font-semibold text-sijil-blue ring-2 ring-white/40">
              {initials}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-sidebar-accent-foreground">{name}</span>
            <span className="block truncate text-xs text-sidebar-foreground/70">{subtitle}</span>
          </span>
        </NavLink>
        <button
          type="button"
          onClick={onSignOut}
          aria-label="Sign out"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sidebar-foreground/70 transition-colors hover:bg-white/10 hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
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

export function AppShell({
  role,
  children,
  contentClassName,
}: {
  role: Role;
  children: React.ReactNode;
  contentClassName?: string;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile } = useLearnerProfile();
  const { profile: recruiterProfile } = useRecruiterProfile(role === "recruiter");
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
      : (recruiterProfile?.initials ?? user?.email?.slice(0, 2).toUpperCase() ?? "RC");
  const handleSignOut = () => {
    void signOut().then(() =>
      navigate(role === "recruiter" ? "/login/recruiter" : "/"),
    );
  };

  const sidebarContent = (
    <>
      <div className="border-b border-sidebar-border px-6 py-6">
        <div className="text-[11px] uppercase tracking-[0.14em] text-sidebar-foreground/60">{role === "recruiter" ? "Recruiter Workspace" : `${roleLabel} workspace`}</div>
        <div className="mt-2">
          <SidebarBrand />
          {role === "recruiter" ? <p className="mt-1 text-[11px] text-white/55">Verified skills. Trusted talent.</p> : null}
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
              tone="recruiter"
            />
          ))
        )}
      </div>
      {role === "recruiter" ? (
        <RecruiterSidebarAccount
          name={recruiterProfile?.fullName?.trim() || "Recruiter"}
          subtitle={recruiterProfile?.jobTitle?.trim() || "My Profile"}
          initials={avatar}
          avatarUrl={recruiterProfile?.avatarUrl ?? null}
          active={navActive(pathname, "/recruiter/profile")}
          onNavigate={() => setDrawerOpen(false)}
          onSignOut={handleSignOut}
        />
      ) : (
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
      )}
    </>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside className={cn(
        "sticky top-0 z-30 hidden h-screen w-[17.5rem] shrink-0 flex-col overflow-hidden border-r text-sidebar-foreground lg:flex",
        role === "recruiter" ? "border-white/10 bg-sijil-blue" : "border-sidebar-border bg-[image:var(--sidebar-gradient)]",
      )}>
        {sidebarContent}
      </aside>

      <main className="flex min-h-screen min-w-0 flex-1 flex-col pb-16 lg:pb-0">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/70 bg-background/75 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-2">
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl lg:hidden" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className={cn("w-64 p-0 text-sidebar-foreground", role === "recruiter" ? "bg-sijil-blue" : "bg-[image:var(--sidebar-gradient)]")}>
                <SheetHeader className="sr-only">
                  <SheetTitle>Navigation</SheetTitle>
                </SheetHeader>
                <div className="flex h-full flex-col">{sidebarContent}</div>
              </SheetContent>
            </Sheet>
            {role === "learner" ? (
              <div className="text-sm">
                <span className="font-semibold text-foreground">{roleLabel}</span>
                <span className="hidden text-muted-foreground sm:inline"> · Verification workspace</span>
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            {ZKP_UI_ENABLED && (role === "learner" || role === "recruiter") ? <VerificationBell role={role} /> : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {role === "recruiter" ? (
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-xl border border-[#e2e8f0] bg-white py-1 pl-1 pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sijil-blue"
                    aria-label="Account menu"
                  >
                    {recruiterProfile?.avatarUrl ? (
                      <img src={recruiterProfile.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sijil-blue text-xs font-semibold text-white">
                        {avatar}
                      </div>
                    )}
                    <div className="hidden min-w-0 text-left sm:block">
                      <p className="max-w-[9rem] truncate text-xs font-semibold text-sijil-blue">
                        {recruiterProfile?.fullName ?? "Recruiter"}
                      </p>
                      <p className="text-[10px] text-[#64748b]">Recruiter</p>
                    </div>
                    <span
                      className={cn(
                        "hidden items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline-flex",
                        recruiterProfile?.verificationStatus === "verified" ||
                          recruiterProfile?.verificationStatus === "company_domain_verified"
                          ? "bg-[#ccfbf1] text-[#0f766e]"
                          : "bg-[#fff7ed] text-[#c2410c]",
                      )}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      {recruiterProfile
                        ? recruiterVerificationLabel(recruiterProfile.verificationStatus)
                        : "Recruiter"}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Account menu"
                  >
                    {profile?.avatarUrl ? (
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
                )}
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
                {role === "recruiter" && (
                  <>
                    <DropdownMenuItem onClick={() => navigate("/recruiter/profile")}>
                      My Profile
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
        <div className={cn(
          "workspace-content flex-1 animate-fade-in",
          role === "recruiter" ? "w-full !max-w-none px-4 pb-4 pt-3 sm:px-6 sm:pb-6 lg:px-6 lg:pb-6 lg:pt-4" : "p-4 sm:p-6 lg:p-8",
          contentClassName,
        )}>{children}</div>
      </main>

      <MobileBottomTabs
        items={mobileTabItems}
        pathname={pathname}
        account={role === "recruiter" ? {
          to: "/recruiter/profile",
          initials: avatar,
          avatarUrl: recruiterProfile?.avatarUrl ?? null,
        } : undefined}
      />
    </div>
  );
}
