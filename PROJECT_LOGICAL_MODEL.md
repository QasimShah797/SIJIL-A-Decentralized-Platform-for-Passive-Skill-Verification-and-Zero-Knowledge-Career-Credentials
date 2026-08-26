# SIJIL — Project Logical Model

> **Purpose:** Complete source-of-truth documentation of the existing SIJIL website as implemented in this repository. Derived entirely from source code inspection (`src/App.tsx`, pages, components, hooks, services, backend routes). No speculative functionality is documented.
>
> **Product:** SIJIL (Skill Integrity & Journey Intelligence Ledger) — a verifiable competency credentials platform for learners, institutions, and recruiters.
>
> **Stack:** React (Vite + TypeScript + Tailwind + shadcn/ui) frontend, Express backend, Supabase (PostgreSQL, Auth, Storage, Edge Functions).

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [User Roles & Permissions](#2-user-roles--permissions)
3. [Design System & UI Patterns](#3-design-system--ui-patterns)
4. [Navigation Hierarchy](#4-navigation-hierarchy)
5. [Reusable Components Catalog](#5-reusable-components-catalog)
6. [Screen Inventory Table](#6-screen-inventory-table)
7. [Detailed Screen Descriptions](#7-detailed-screen-descriptions)
8. [User Journeys & Flows](#8-user-journeys--flows)
9. [API & Data Layer Reference](#9-api--data-layer-reference)
10. [Known Gaps & Inconsistencies](#10-known-gaps--inconsistencies)

---

## 1. Architecture Overview

```
┌─────────────────────┐
│   React Frontend    │  Vite + TypeScript + Tailwind + shadcn/ui (src/)
└──────────┬──────────┘
           │  HTTP /api  (JWT from Supabase Auth)
           ▼
┌─────────────────────┐
│  Express Backend    │  Node.js + TypeScript (backend/)
└──────────┬──────────┘
           │  Service role (server-side only)
           ▼
┌─────────────────────┐
│      Supabase       │  PostgreSQL · Auth · Storage · Edge Functions
└─────────────────────┘
```

**Frontend data pattern:** API-first with Supabase fallback. When `VITE_API_BASE_URL` is unset, the frontend operates fully via direct Supabase queries in `src/lib/db/*`.

**Route definition file:** `src/App.tsx` (single source of truth for all frontend routes).

**Layout shells:**
| Shell | Used by |
|-------|---------|
| `AuthEntryLayout` | Auth entry, learner login/signup |
| `RecruiterAuthLayout` | Recruiter login |
| Standalone full-screen card | Institution login, student activation, GitHub OAuth, review pages |
| `AppShell` | All authenticated learner, institution, recruiter workspace pages |
| Landing layout (header + sections + footer) | `/about` |
| Minimal centered layout | 404, GitHub callback/prepare |

---

## 2. User Roles & Permissions

### Roles (from `user_roles` table)

| Role | Home route (`ROLE_HOME`) | Registration |
|------|--------------------------|--------------|
| `learner` | `/learner/profile` | Public self-signup at `/signup/learner`; institution-provisioned via activation link |
| `recruiter` | `/recruiter/search` | Admin-provisioned only (no public signup) |
| `institution` | `/institution/dashboard` | Admin-provisioned only (no public signup) |
| `admin` | `/learner/profile` | Not found in frontend UI — backend role only |

### Route Guards

| Guard | File | Requirements |
|-------|------|--------------|
| `RequireLearnerRoute` | `src/components/RequireLearnerRoute.tsx` | Authenticated; role includes `learner`; profile row exists; institution learners must have `account_activated_at`; optionally requires complete profile (default `true`) |
| `RequireInstitutionRoute` | `src/components/RequireInstitutionRoute.tsx` | Authenticated; role includes `institution`; institution profile exists with `status === "active"` |
| `RequireRecruiterRoute` | `src/components/RequireRecruiterRoute.tsx` | Authenticated; role includes `recruiter`; row in `recruiter_profiles` |

### Access Denial States

Each guard renders full-screen denial UI (not AppShell) with reason-specific copy and Sign out button:
- **Learner:** `wrong_role`, `no_profile`, `not_activated`, `incomplete_profile` (redirect to `/learner/complete-profile`)
- **Institution:** `wrong_role`, `no_profile`, `inactive`
- **Recruiter:** `wrong_role`, `no_profile`

Unauthenticated users redirect to role-specific login with `state.from` preserved.

---

## 3. Design System & UI Patterns

### Color Palette (CSS variables in `src/index.css`)

| Token | Light mode role |
|-------|-----------------|
| `--primary` | Navy (`222 47% 17%`) — primary actions, headings |
| `--success` | Verified green (`152 65% 36%`) — verified states |
| `--warning` | Amber (`38 92% 50%`) — decay alerts, caution |
| `--info` | Chain blue (`217 91% 50%`) — informational callouts |
| `--destructive` | Red — errors, rejections |
| `--background` | Light slate page background |
| `--sidebar-*` | Workspace sidebar tokens |

Dark mode overrides exist via `.dark` class (toggled by `ThemeProvider` + `ThemeToggle`).

### Typography

- Body: system font with `font-feature-settings: "cv11", "ss01"` and tabular nums
- Headings: `tracking-tight`
- Monospace (`mono` class): DIDs, hashes, proof values
- Sidebar group labels: `text-[11px] uppercase tracking-wider`

### Spacing & Layout

- AppShell main content: `max-w-7xl`, padding `p-6 lg:p-8`
- Auth cards: `max-w-md`, `rounded-2xl`, backdrop blur, custom navy shadow
- Landing container: `max-w-[1220px]` via `landing-styles.ts`
- Section spacing: `.sijil-section` (`py-16 sm:py-20`), `.landing-section` (`py-14 sm:py-16 lg:py-24`)

### Border Radius

- Base `--radius`: `0.625rem`
- Cards: `rounded-2xl` / `rounded-[1.125rem]` (landing)
- Buttons/inputs: `rounded-xl`
- Sidebar nav items: `rounded-xl`

### Component Library

Built on **shadcn/ui** (Radix primitives) in `src/components/ui/*`: Button, Card, Dialog, Input, Select, Table, Tabs, Toast, Switch, Badge, etc.

### Icons

**Lucide React** throughout (`lucide-react`). Common icons: `GraduationCap`, `Briefcase`, `ShieldCheck`, `Wallet`, `Search`, `Bell`, `LogOut`, etc.

### Images/Assets

- `src/assets/sijil-logo.png` — SIJIL logo (AppShell sidebar, auth pages, landing)
- `public/placeholder.svg` — generic placeholder
- `public/robots.txt` — SEO

### Animations

- `animate-fade-in` on page content and auth cards
- `ScrollReveal` / `.landing-reveal` on landing sections (IntersectionObserver)
- Accordion, toast animations via Tailwind plugin

### Responsive Breakpoints (Tailwind defaults)

- `sm:` — 640px (2-column grids, inline subtitle)
- `md:` — 768px (DID display, grid layouts)
- `lg:` — 1024px (auth 2-column, sidebar always visible)
- Mobile: Landing uses drawer menu; AppShell keeps fixed `w-64` sidebar (no mobile collapse/hamburger in AppShell — **needs clarification** if intentional)

---

## 4. Navigation Hierarchy

### Public / Unauthenticated

```
/  (Auth Entry — role picker + learner auth)
├── /about  (Landing / marketing)
├── /login/learner  → AuthEntry (learner sign-in tab)
├── /signup/learner  → AuthEntry (learner sign-up tab)
├── /login/recruiter  (Recruiter login)
├── /login/institution  (Institution login)
├── /student/activate?token=  (Student activation)
├── /review/invite/:token  (Peer review form — public)
├── /review/request/:token  (Context review form — public, API required)
└── /recruiter/verify/:token  (Public presentation viewer)
```

### Learner Workspace (AppShell, role="learner")

```
Profile
├── /learner/profile          Competencies (dashboard)
└── /learner/my-profile       My Profile

Evidence
└── /learner/integrations     Integrations (GitHub, Moodle)

Assessment
├── /learner/task               Practical Task (MCQ)
└── /learner/validation         Validation Trail (hidden until ≥1 skill declared)
    └── /learner/validation/:skillId

Identity
├── /learner/wallet             Wallet
└── /learner/peer-reviews       Peer Reviews

Onboarding (no AppShell):
└── /learner/complete-profile   Complete Profile

Credential sub-routes (AppShell, no sidebar links):
├── /learner/credential/:id
├── /learner/credential/:id/proof
└── /learner/credential/:id/share

OAuth (guarded):
├── /auth/github/prepare
└── /auth/github/callback
```

### Institution Workspace (AppShell, role="institution")

```
/institution  → redirect to /institution/dashboard
├── /institution/dashboard       Dashboard
├── /institution/students          Student Management
├── /institution/queue             Attestation Queue
├── /institution/attestation-request/:id   Request Detail
├── /institution/attestation/:id           → redirect to attestation-request
└── /institution/attestation/:id/validation  Validation Trail (orphaned — no in-app links)
```

### Recruiter Workspace (AppShell, role="recruiter")

```
/recruiter/search                  Search Candidates
/recruiter/candidate/:id           Candidate Summary
/recruiter/compare?ids=&skill=     Compare
/recruiter/verify/:token           Public verify (no auth, no AppShell)
```

---

## 5. Reusable Components Catalog

### SIJIL Domain Components (`src/components/sijil/`)

| Component | Purpose | Used in |
|-----------|---------|---------|
| `AppShell` | Role-aware sidebar + header + sign-out | 18+ workspace pages |
| `PageHeader` | Title, description, action buttons | All AppShell pages, CompetencyPresentationView |
| `StatusBadge` | Semantic status pill (verified/warning/info/neutral/destructive) | Profile, wallet, validation, institution, integrations |
| `Field` | Form field wrapper with label and hint | Complete profile flows, MyProfile, signup |
| `FieldRow` | Key-value display row with optional mono font | Credential pages, CandidateSummary, presentation viewer |
| `InfoHint` | Tooltip info icon | FieldRow, MyProfile, WalletPage |
| `ThemeToggle` | Light/dark switch | AppShell header, auth panels, landing header |

### Auth Components (`src/components/auth/`)

| Component | Purpose | Used in |
|-----------|---------|---------|
| `AuthEntryLayout` | 2-column auth layout | AuthEntry |
| `AuthLeftPanel` | Branding hero + feature mockup | AuthEntryLayout |
| `RecruiterAuthLayout` | Recruiter-specific 2-column layout | RecruiterLogin |
| `RecruiterLeftPanel` | Recruiter branding panel | RecruiterAuthLayout |
| `LearnerSignInForm` | Email/password sign-in | AuthEntry |
| `LearnerSignUpForm` | Self-signup form (Zod validated) | AuthEntry |
| `RecruiterSignInForm` | Recruiter sign-in | RecruiterLogin |
| `PasswordInput` | Password with show/hide toggle | All sign-in forms |
| `ForgotPasswordDialog` | Password reset via Supabase | LearnerSignInForm, RecruiterSignInForm |

### Integration Components (`src/components/integrations/`)

| Component | Purpose | Used in |
|-----------|---------|---------|
| `IntegrationSummary` | Stats bar (sources, GitHub, LMS, certs, last sync) | Integrations |
| `IntegrationConnectionCard` | Connect/disconnect card per source | Integrations |
| `GitHubEvidencePanel` | Repo list, sync, skill linking | Integrations |
| `GitHubEvidenceRow` | Single repo row | GitHubEvidencePanel |
| `LMSActivityPanel` | Moodle/LMS activity list | Integrations |
| `LMSActivityRow` | Single LMS activity row | LMSActivityPanel |
| `CertificatesPanel` | Certificate evidence (upload stub) | Integrations |
| `IntegrationEmptyState` | Empty state with CTA | GitHub/LMS/Certificates panels |

### Profile Components (`src/components/profile/`)

| Component | Purpose | Used in |
|-----------|---------|---------|
| `VerifiedProfessionalAccounts` | GitHub + LinkedIn verification section | MyProfile, both complete-profile flows |
| `VerifiedGitHubCard` | GitHub connect/verify card | VerifiedProfessionalAccounts |
| `LinkedInProfileUrlField` | LinkedIn URL with verification badge | VerifiedProfessionalAccounts |

### Wallet Components (`src/components/wallet/`)

| Component | Purpose | Used in |
|-----------|---------|---------|
| `CompetencyShareDialog` | Selective disclosure share dialog | WalletPage |

### Landing Components (`src/components/landing/`)

| Component | Purpose |
|-----------|---------|
| `LandingHeader` | Sticky nav, anchor links, Sign In / Get Started, mobile drawer |
| `HeroSection` | Hero with CTAs and competency mock card |
| `EvidenceStrip` | GitHub, Moodle, Practical Tasks, Reviews icons |
| `ProcessSection` | 4-step workflow |
| `EvidenceWalletSection` | Evidence types + wallet mock |
| `RecruiterSection` | Recruiter trust points + disclosure preview |
| `FinalCTA` | Bottom call-to-action |
| `LandingFooter` | Product / Access / Project links |
| `ScrollReveal` | IntersectionObserver fade-in |
| `SectionHeading` | Eyebrow + title + description |
| `Logo` | Logo image + wordmark |
| `useActiveSection` | Active nav section tracking |

### Route Guards

| Component | File |
|-----------|------|
| `RequireLearnerRoute` | `src/components/RequireLearnerRoute.tsx` |
| `RequireInstitutionRoute` | `src/components/RequireInstitutionRoute.tsx` |
| `RequireRecruiterRoute` | `src/components/RequireRecruiterRoute.tsx` |

### Exported from Pages (reused elsewhere)

| Component | File | Used in |
|-----------|------|---------|
| `ReviewCard` | `src/pages/learner/PeerReviews.tsx` | CandidateSummary |

---

## 6. Screen Inventory Table

| # | Screen | Route | User Role | Purpose | Connected Screens |
|---|--------|-------|-----------|---------|-------------------|
| 1 | Auth Entry | `/` | Public | Role picker; learner sign-in/sign-up | `/login/recruiter`, `/about`, `/learner/profile`, `/learner/complete-profile` |
| 2 | Landing / About | `/about` | Public | Marketing product page | `/` (CTAs) |
| 3 | Learner Login | `/login/learner` | Public | Learner sign-in (re-exports AuthEntry) | `/`, `/learner/profile`, `/learner/complete-profile` |
| 4 | Learner Signup | `/signup/learner` | Public | Learner self-registration | `/learner/complete-profile` |
| 5 | Recruiter Login | `/login/recruiter` | Public | Recruiter sign-in | `/`, `/recruiter/search` |
| 6 | Institution Login | `/login/institution` | Public | Institution sign-in | `/`, `/institution/dashboard` |
| 7 | Student Activation | `/student/activate?token=` | Public (token) | First-time password for institution students | `/learner/complete-profile` |
| 8 | Complete Profile | `/learner/complete-profile` | Learner (incomplete OK) | Onboarding form (institution vs self-signup) | `/learner/profile` |
| 9 | Competencies Dashboard | `/learner/profile` | Learner | Declare/manage competencies, trust signals, decay alerts | `/learner/my-profile`, `/learner/validation/:id`, `/learner/integrations`, `/learner/task`, `/learner/peer-reviews` |
| 10 | My Profile | `/learner/my-profile` | Learner | View/edit personal profile | GitHub OAuth return |
| 11 | Integrations | `/learner/integrations` | Learner | GitHub/Moodle connect, evidence linking | `/learner/validation/:id`, OAuth flows |
| 12 | Practical Task | `/learner/task` | Learner | AI-generated MCQ assessments per skill | — |
| 13 | Validation Trail (list) | `/learner/validation` | Learner | Pipeline status overview | `/learner/validation/:skillId`, `/learner/profile`, `/learner/wallet`, `/learner/integrations` |
| 14 | Validation Trail (detail) | `/learner/validation/:skillId` | Learner | Evidence trail per competency | Same as above |
| 15 | Wallet | `/learner/wallet` | Learner | Competency wallet records, evidence packages, sharing | Share dialog → `/recruiter/verify/:token` |
| 16 | Peer Reviews | `/learner/peer-reviews` | Learner | Manage invitations, trust signals, reviews | `/review/invite/:token`, `/review/request/:token` |
| 17 | Credential Details | `/learner/credential/:id` | Learner | Full VC-style credential view | `/learner/wallet`, proof, share |
| 18 | Credential Proof | `/learner/credential/:id/proof` | Learner | Cryptographic proof display (mock verify) | Credential details |
| 19 | Selective Disclosure | `/learner/credential/:id/share` | Learner | Choose fields to disclose to recruiters | `/recruiter/verify/:token` |
| 20 | GitHub Prepare | `/auth/github/prepare` | Learner | Pre-OAuth session clear | `/auth/github/callback`, return URL |
| 21 | GitHub Callback | `/auth/github/callback` | Authenticated | OAuth code exchange + sync | Return URL with `?github=` param |
| 22 | Institution Dashboard | `/institution/dashboard` | Institution | Attestation overview, inline approve/reject | `/institution/queue`, `/institution/attestation-request/:id` |
| 23 | Attestation Queue | `/institution/queue` | Institution | Searchable/filterable request table | `/institution/attestation-request/:id` |
| 24 | Attestation Request Detail | `/institution/attestation-request/:id` | Institution | Full evidence review + decision | `/institution/dashboard`, `/institution/queue` |
| 25 | Institution Validation Trail | `/institution/attestation/:id/validation` | Institution | Read-only validation trail | `/institution/attestation-request/:id` (back only; no inbound links) |
| 26 | Student Management | `/institution/students` | Institution | Learners derived from attestation requests | `/institution/queue` |
| 27 | Attestation Detail (redirect) | `/institution/attestation/:id` | Institution | Legacy URL redirect | → attestation-request |
| 28 | Recruiter Search | `/recruiter/search` | Recruiter | Skill-based candidate search + compare selection | `/recruiter/candidate/:id`, `/recruiter/compare` |
| 29 | Candidate Summary | `/recruiter/candidate/:id` | Recruiter | Evidence-backed candidate view | `/recruiter/search`, `/recruiter/verify/:token` |
| 30 | Candidate Compare | `/recruiter/compare?ids=` | Recruiter | Side-by-side comparison | `/recruiter/search`, candidate summaries |
| 31 | Public Presentation Viewer | `/recruiter/verify/:token` | Public | Selective disclosure verification | Back navigation |
| 32 | Peer Review Invite Form | `/review/invite/:token` | Public (token) | Secure peer review submission | `/` |
| 33 | Context Review Request Form | `/review/request/:token` | Public (token) | Context-verified review (API required) | `/` |
| 34 | Not Found | `*` | Public | 404 page | `/` |
| 35 | CredentialView (unrouted) | **Not registered** | — | Implemented but not mounted in router | **Needs clarification** |

---

## 7. Detailed Screen Descriptions

Each screen follows the 24-point structure. Screens sharing identical layout patterns note "See Design System" where applicable.

---

### Screen 1: Auth Entry

1. **Screen Name:** Auth Entry / Role Selection
2. **Route/URL:** `/` (also serves `/login/learner` and `/signup/learner` via re-exports)
3. **Purpose:** Unified entry point for role selection and learner authentication
4. **Target User/Role:** Public (unauthenticated); Learner for forms
5. **How the user reaches this screen:** Direct visit, landing CTAs, sign-out (learner), 404 link, learner login route
6. **Main layout:** `AuthEntryLayout` — 2-column grid on `lg+`: left branding panel + right form card (`max-w-md`)
7. **Header/navigation:** Logo in left panel links to `/`; "Learn more" → `/about`; `ThemeToggle` in left panel
8. **Sidebar/navigation items:** None
9. **Main content:** Role selector (Learner / Recruiter radio grid); when Learner selected: Tabs (Sign in / Sign up) with respective forms
10. **Components used:** `AuthEntryLayout`, `AuthLeftPanel`, `Tabs`, `LearnerSignInForm`, `LearnerSignUpForm`, Lucide icons (`GraduationCap`, `Briefcase`)
11. **Fields/input elements:** Delegated to child forms (see Screens 3–4)
12. **Buttons/actions:** Role selector buttons; tab triggers; Recruiter selection navigates away to `/login/recruiter`
13. **Tables/cards/lists:** Role selection cards with border highlight on selected
14. **Filters/search/sorting:** None
15. **Data shown:** Product branding copy; feature mockup (desktop only in left panel)
16. **User interactions:** Select role; switch sign-in/sign-up tabs; submit auth forms
17. **Success states:** Redirect to role home or complete-profile
18. **Error states:** Toast notifications from child forms
19. **Empty states:** No form shown until role selected (opacity/translate transition)
20. **Loading states:** Auth loading handled in child forms and guards
21. **Navigation to other screens:** Recruiter → `/login/recruiter`; post-login → `/learner/profile` or `/learner/complete-profile`
22. **Responsive/mobile behavior:** Single column below `lg`; left panel hidden or stacked
23. **Important business rules:** Recruiter auth is never embedded — always navigates to dedicated page; `/signup/learner` path pre-selects signup tab
24. **Existing UI/visual design details:** Card `rounded-2xl border-border/70 bg-card/95 backdrop-blur`; custom navy shadow; `animate-fade-in`

---

### Screen 2: Landing / About

1. **Screen Name:** Landing Page
2. **Route/URL:** `/about`
3. **Purpose:** Marketing and product explainer
4. **Target User/Role:** Public
5. **How the user reaches this screen:** "Learn more" from auth panel; footer links
6. **Main layout:** Full-page scroll: `LandingHeader` → main sections → `LandingFooter`
7. **Header/navigation:** Sticky `LandingHeader` with anchor links (`#home`, `#how-it-works`, `#evidence`, `#wallet`, `#for-recruiters`); Sign In / Get Started → `/`; mobile drawer menu; `ThemeToggle`
8. **Sidebar/navigation items:** None
9. **Main content:** `HeroSection`, `EvidenceStrip`, `ProcessSection`, `EvidenceWalletSection`, `RecruiterSection`, `FinalCTA`
10. **Components used:** All landing components; `ScrollReveal` wrappers; `useActiveSection` for nav highlight
11. **Fields/input elements:** None (static)
12. **Buttons/actions:** Get Started → `/`; See How It Works (scroll); section CTAs → `/`
13. **Tables/cards/lists:** Process step cards; evidence type cards; wallet mock card (non-interactive buttons)
14. **Filters/search/sorting:** None
15. **Data shown:** Static marketing copy; mock competency card; mock disclosure preview
16. **User interactions:** Anchor scroll; theme toggle; mobile drawer open/close
17. **Success states:** N/A
18. **Error states:** N/A
19. **Empty states:** N/A
20. **Loading states:** N/A
21. **Navigation to other screens:** All CTAs → `/`
22. **Responsive/mobile behavior:** Drawer nav on mobile; responsive section padding; `ScrollReveal` respects reduced motion
23. **Important business rules:** No API calls; purely informational
24. **Existing UI/visual design details:** `.landing-section` spacing; `.landing-cta` gradient; smooth scroll (`html { scroll-behavior: smooth }`)

---

### Screen 3: Learner Login

1. **Screen Name:** Learner Sign In
2. **Route/URL:** `/login/learner`
3. **Purpose:** Authenticate existing learner accounts
4. **Target User/Role:** Learner (public form)
5. **How the user reaches this screen:** Auth entry role picker; signup form link; recruiter login link; route guard redirect
6. **Main layout:** Same as Auth Entry with sign-in tab active
7. **Header/navigation:** Auth left panel
8. **Sidebar/navigation items:** None
9. **Main content:** `LearnerSignInForm`
10. **Components used:** `LearnerSignInForm`, `PasswordInput`, `ForgotPasswordDialog`, Checkbox
11. **Fields/input elements:** Email; Password; Remember me checkbox
12. **Buttons/actions:** Sign in; Forgot password?; Create account (switches tab)
13. **Tables/cards/lists:** None
14. **Filters/search/sorting:** None
15. **Data shown:** Remembered email from `localStorage` key `sijil.rememberedEmail`
16. **User interactions:** Submit credentials; open forgot password dialog
17. **Success states:** Toast "Signed in"; navigate to `/learner/profile` or `/learner/complete-profile`
18. **Error states:** Wrong credentials toast; wrong role → sign out + toast; not activated → sign out + toast; no profile → sign out + toast
19. **Empty states:** N/A
20. **Loading states:** Button disabled while `busy`
21. **Navigation to other screens:** Success → learner home; incomplete profile → `/learner/complete-profile`
22. **Responsive/mobile behavior:** Auth card responsive padding
23. **Important business rules:** Post-login calls `verifyLearnerAccess`; institution learners must be activated
24. **Existing UI/visual design details:** `PasswordInput` with lock icon and eye toggle; `rounded-xl` inputs

---

### Screen 4: Learner Signup

1. **Screen Name:** Learner Sign Up
2. **Route/URL:** `/signup/learner`
3. **Purpose:** Self-registration for non-institution learners
4. **Target User/Role:** Public → new Learner
5. **How the user reaches this screen:** Auth entry signup tab; sign-in form link
6. **Main layout:** Same as Auth Entry with signup tab active
7. **Header/navigation:** Auth left panel
8. **Sidebar/navigation items:** None
9. **Main content:** `LearnerSignUpForm`
10. **Components used:** `LearnerSignUpForm`, `Field`, `PasswordInput`
11. **Fields/input elements:** Full name (max 120); Email; Password (min 8); Confirm password
12. **Buttons/actions:** Create account; Sign in link
13. **Tables/cards/lists:** None
14. **Filters/search/sorting:** None
15. **Data shown:** Field-level validation errors
16. **User interactions:** Submit registration
17. **Success states:** Navigate to `/learner/complete-profile`
18. **Error states:** Zod validation errors; `LearnerSignupError` toast
19. **Empty states:** N/A
20. **Loading states:** Button disabled while submitting
21. **Navigation to other screens:** `/learner/complete-profile` on success
22. **Responsive/mobile behavior:** Standard auth card
23. **Important business rules:** Zod schema with password match refine; calls `signupLearner()` then `refreshRoles()`
24. **Existing UI/visual design details:** Same auth card styling as sign-in

---

### Screen 5: Recruiter Login

1. **Screen Name:** Recruiter Sign In
2. **Route/URL:** `/login/recruiter`
3. **Purpose:** Authenticate recruiter accounts (invitation-only)
4. **Target User/Role:** Recruiter
5. **How the user reaches this screen:** Auth entry Recruiter role selection; route guard redirect
6. **Main layout:** `RecruiterAuthLayout` — 2-column with `RecruiterLeftPanel`
7. **Header/navigation:** Back link → `/`
8. **Sidebar/navigation items:** None
9. **Main content:** Info callout + `RecruiterSignInForm`
10. **Components used:** `RecruiterAuthLayout`, `RecruiterLeftPanel`, `RecruiterSignInForm`, `PasswordInput`, `ForgotPasswordDialog`
11. **Fields/input elements:** Work email; Password; Remember email checkbox
12. **Buttons/actions:** "Sign in to Recruiter Portal" (size lg); link to `/login/learner`
13. **Tables/cards/lists:** None
14. **Filters/search/sorting:** None
15. **Data shown:** Remembered email from `sijil.recruiterRememberedEmail`
16. **User interactions:** Submit credentials
17. **Success states:** Navigate to `/recruiter/search`
18. **Error states:** Invalid credentials; wrong role → sign out + toast; no profile → sign out + toast
19. **Empty states:** N/A
20. **Loading states:** Button disabled while busy
21. **Navigation to other screens:** `/recruiter/search`; back to `/`
22. **Responsive/mobile behavior:** 2-column on lg+
23. **Important business rules:** No public registration; accounts provisioned by SIJIL admins
24. **Existing UI/visual design details:** Info callout `border-info/20 bg-info/5`; "invitation only" badge in left panel

---

### Screen 6: Institution Login

1. **Screen Name:** Institution Sign In
2. **Route/URL:** `/login/institution`
3. **Purpose:** Authenticate institution reviewer accounts
4. **Target User/Role:** Institution
5. **How the user reaches this screen:** Direct URL; route guard redirect; sign-out from institution workspace
6. **Main layout:** Full-screen gradient, centered card (no AppShell, no left panel)
7. **Header/navigation:** SIJIL logo; back arrow → `/`
8. **Sidebar/navigation items:** None
9. **Main content:** Email/password form + info box
10. **Components used:** `Button`, `Input`, `Label`, Lucide icons (`ShieldCheck`, `Lock`, `Mail`, `ArrowLeft`)
11. **Fields/input elements:** Institution email; Password
12. **Buttons/actions:** "Sign in as Institution"
13. **Tables/cards/lists:** None
14. **Filters/search/sorting:** None
15. **Data shown:** Info: "Institution accounts are created by SIJIL. There is no public institution registration."
16. **User interactions:** Submit credentials
17. **Success states:** Toast "Signed in"; navigate to `/institution/dashboard`
18. **Error states:** Invalid credentials; wrong role/inactive/no profile → sign out + specific toast
19. **Empty states:** N/A
20. **Loading states:** Button disabled while busy; auto-redirect if already authenticated
21. **Navigation to other screens:** `/institution/dashboard`
22. **Responsive/mobile behavior:** Centered card on all viewports
23. **Important business rules:** `verifyInstitutionAccess` requires active institution profile
24. **Existing UI/visual design details:** Standalone card with logo; gradient background matching auth theme

---

### Screen 7: Student Activation

1. **Screen Name:** Activate Student Account
2. **Route/URL:** `/student/activate?token=`
3. **Purpose:** First-time password setup for institution-provisioned students
4. **Target User/Role:** Institution-provisioned Learner (pre-activation)
5. **How the user reaches this screen:** Email activation link with token
6. **Main layout:** Full-screen gradient, centered card
7. **Header/navigation:** SIJIL branding
8. **Sidebar/navigation items:** None
9. **Main content:** Token preview card → password form
10. **Components used:** `Button`, `Input`, `Label`
11. **Fields/input elements:** New password; Confirm password (shown after valid preview)
12. **Buttons/actions:** Activate account submit
13. **Tables/cards/lists:** Preview displays: fullName, universityEmail, registrationNumber, institutionName, department, program, batchSemester
14. **Filters/search/sorting:** None
15. **Data shown:** Student preview from token
16. **User interactions:** Set password and activate
17. **Success states:** Auto sign-in; navigate to `/learner/complete-profile`
18. **Error states:** Missing token; load error; password mismatch; API not configured error
19. **Empty states:** N/A
20. **Loading states:** Preview loading spinner; busy during activation
21. **Navigation to other screens:** `/learner/complete-profile`
22. **Responsive/mobile behavior:** Centered card
23. **Important business rules:** Requires `isApiEnabled()` (backend); not normal login; password hint: 8+ chars with uppercase, lowercase, number, special character
24. **Existing UI/visual design details:** Explicit copy: "This is not normal login"

---

### Screen 8: Complete Profile (Router)

1. **Screen Name:** Complete Profile
2. **Route/URL:** `/learner/complete-profile`
3. **Purpose:** Detect learner type and delegate to correct onboarding form
4. **Target User/Role:** Learner (profile incomplete allowed)
5. **How the user reaches this screen:** Post-signup; post-activation; route guard redirect for incomplete profile
6. **Main layout:** Full-screen loading or child form layout (no AppShell)
7. **Header/navigation:** None
8. **Sidebar/navigation items:** None
9. **Main content:** Loading → `InstitutionCompleteProfile` OR `SelfSignupCompleteProfile`
10. **Components used:** Child page components
11. **Fields/input elements:** Delegated to child
12. **Buttons/actions:** None at router level
13. **Tables/cards/lists:** None
14. **Filters/search/sorting:** None
15. **Data shown:** "SIJIL" + "Loading…" during detection
16. **User interactions:** Automatic routing
17. **Success states:** Child form completion → `/learner/profile`
18. **Error states:** Redirect to login/signup on missing data
19. **Empty states:** N/A
20. **Loading states:** Pulse loader during mode detection
21. **Navigation to other screens:** `/login/learner`, `/signup/learner`, `/learner/profile`
22. **Responsive/mobile behavior:** Child-dependent
23. **Important business rules:** Branch on `isInstitutionProvisionedProfile(row)`
24. **Existing UI/visual design details:** Centered loader

---

### Screen 8a: Self-Signup Complete Profile

1. **Screen Name:** Self-Signup Onboarding
2. **Route/URL:** Rendered at `/learner/complete-profile` (self-signup branch)
3. **Purpose:** Multi-section onboarding for self-registered learners
4. **Target User/Role:** Self-signup Learner
5. **How the user reaches this screen:** Via Complete Profile router when no institution_id
6. **Main layout:** Full-screen gradient; `max-w-2xl` centered; progress bar
7. **Header/navigation:** None
8. **Sidebar/navigation items:** None
9. **Main content:** Sections: Personal details; Education (optional); Professional links; About you
10. **Components used:** `Input`, `Button`, `Textarea`, `Progress`, `Select`, `Field`, `VerifiedProfessionalAccounts`
11. **Fields/input elements:** Phone, country, city, bio, skillsSummary, careerGoal (required); optional DOB, gender, education fields, LinkedIn URL; avatar upload
12. **Buttons/actions:** Avatar upload/remove/change; "Complete profile"
13. **Tables/cards/lists:** None
14. **Filters/search/sorting:** None
15. **Data shown:** Progress percentage; avatar preview
16. **User interactions:** Field edits; debounced auto-save (1s); GitHub OAuth
17. **Success states:** Toast; navigate to `/learner/profile`
18. **Error states:** Validation toasts; OAuth requirement errors
19. **Empty states:** N/A
20. **Loading states:** Auth/checking loader
21. **Navigation to other screens:** `/learner/profile`; GitHub OAuth round-trip
22. **Responsive/mobile behavior:** `sm:grid-cols-2` grids; `px-4 py-10`
23. **Important business rules:** GitHub verification required (`meetsOAuthCompletionRequirements`); graduation year 1950–2100; localStorage draft key `"self_signup"`; rejects institution-linked rows
24. **Existing UI/visual design details:** Progress bar; section headings

---

### Screen 8b: Institution Complete Profile

1. **Screen Name:** Institution Student Onboarding
2. **Route/URL:** Rendered at `/learner/complete-profile` (institution branch)
3. **Purpose:** Onboarding for institution-provisioned, activated learners
4. **Target User/Role:** Institution-provisioned Learner
5. **How the user reaches this screen:** Post-activation; Complete Profile router
6. **Main layout:** Full-screen gradient; `max-w-2xl`
7. **Header/navigation:** None
8. **Sidebar/navigation items:** None
9. **Main content:** Personal (editable); University (read-only); Professional links; About you; avatar
10. **Components used:** `Input`, `Button`, `Textarea`, `Field`, `StatusBadge`, `VerifiedProfessionalAccounts`
11. **Fields/input elements:** firstName, lastName, institutionName, program, studentId, contactNumber, cityCountry, bio, skillsSummary, careerGoal; read-only university fields
12. **Buttons/actions:** Avatar upload/remove; "Complete profile"
13. **Tables/cards/lists:** Read-only university info block
14. **Filters/search/sorting:** None
15. **Data shown:** "Verified Student" badge; immutable university data
16. **User interactions:** Edit personal/about fields; GitHub OAuth
17. **Success states:** Navigate to `/learner/profile`
18. **Error states:** Validation/OAuth/save toasts
19. **Empty states:** Returns null if wrong profile type
20. **Loading states:** Auth/checking loader
21. **Navigation to other screens:** `/learner/profile`; `/login/learner` if missing activation
22. **Responsive/mobile behavior:** `sm:grid-cols-2`
23. **Important business rules:** Requires `institution_id` + `account_activated_at`; GitHub required; university fields immutable; draft key `"institution"`
24. **Existing UI/visual design details:** Verified Student badge; locked university section styling

---

### Screen 9: Competencies Dashboard (Profile)

1. **Screen Name:** Competencies / Learner Profile Dashboard
2. **Route/URL:** `/learner/profile`
3. **Purpose:** Declare and manage competencies; view trust signals and decay notifications
4. **Target User/Role:** Learner (complete profile required)
5. **How the user reaches this screen:** Post-login home; AppShell nav; notification bell
6. **Main layout:** `AppShell role="learner"` + `PageHeader`
7. **Header/navigation:** AppShell header with decay notification bell → `#notifications`; DID snippet; avatar
8. **Sidebar/navigation items:** Profile group: Competencies (active), My Profile
9. **Main content:** Notifications panel (`#notifications`); profile summary card; trust signals grid (6 metrics); competencies list
10. **Components used:** `PageHeader`, `StatusBadge`, `Card`, `Button`, `Input`, `Label`, `Textarea`, `Select`, `Dialog`
11. **Fields/input elements:** Dialog: competency name, domain (preset + "Other" custom), optional description
12. **Buttons/actions:** "Declare competency"; per-skill Edit, Delete, View Pipeline; "View / Edit Profile"; "Manage reviews"; notification actions (Sync now, Run task, Close)
13. **Tables/cards/lists:** Competency cards with status, domain, description, last sync days; trust signal stat cards
14. **Filters/search/sorting:** None
15. **Data shown:** Avatar, name, Verified Student badge, institution, reg/program; trust stats; skills with pipeline status
16. **User interactions:** CRUD competencies via dialog; open notifications via hash; navigate to related pages
17. **Success states:** Toasts on add/update/remove competency
18. **Error states:** Toasts on mutation failure
19. **Empty states:** "No competencies declared yet…"; notifications: "All your competencies are fresh"
20. **Loading states:** "Loading profile…" while profile/skills load
21. **Navigation to other screens:** `/learner/my-profile`, `/learner/peer-reviews`, `/learner/validation/:id`, `/learner/integrations`, `/learner/task`
22. **Responsive/mobile behavior:** Profile card `sm:flex-row`; trust grid `grid-cols-2 md:grid-cols-6`
23. **Important business rules:** Submit requires name + domain (+ custom if Other); decay alerts when no activity within `SKILL_DECAY_DAYS`; status label mapping ("Skill Claimed" → "Competency Claimed")
24. **Existing UI/visual design details:** Amber decay badge on notification bell; `StatusBadge` variants per pipeline stage

---

### Screen 10: My Profile

1. **Screen Name:** My Profile
2. **Route/URL:** `/learner/my-profile`
3. **Purpose:** View and edit learner profile with role-specific field sets
4. **Target User/Role:** Learner
5. **How the user reaches this screen:** AppShell nav; "View / Edit Profile" from competencies dashboard
6. **Main layout:** `AppShell` + `PageHeader` + stacked `Card` sections
7. **Header/navigation:** AppShell standard
8. **Sidebar/navigation items:** Profile group: My Profile (active)
9. **Main content:** Avatar header; Personal; Verified university OR Education; Professional links; Career; DID/wallet section
10. **Components used:** `PageHeader`, `StatusBadge`, `InfoHint`, `Field`, `Card`, `Button`, `Input`, `Textarea`, `VerifiedProfessionalAccounts`, `LockedField`, `ReadOnlyRow`
11. **Fields/input elements:** Edit mode fields vary by institution vs self-signup (see business rules)
12. **Buttons/actions:** "Edit profile" / Cancel / "Save changes"; avatar upload
13. **Tables/cards/lists:** Read-only rows for locked fields
14. **Filters/search/sorting:** None
15. **Data shown:** Name, avatar, institution/email, locked fields, DID, bio, skills summary, career goal, LinkedIn/GitHub status
16. **User interactions:** Toggle edit mode; avatar file pick; GitHub OAuth
17. **Success states:** Toast "Profile updated"
18. **Error states:** Validation/save toasts
19. **Empty states:** Locked fields show "—"
20. **Loading states:** "Loading profile…"
21. **Navigation to other screens:** GitHub OAuth return to same page
22. **Responsive/mobile behavior:** `sm:grid-cols-2`; avatar header flex
23. **Important business rules:** Full name always locked; institution: cityCountry editable, university fields locked; self-signup: city/country/DOB/gender/education editable
24. **Existing UI/visual design details:** Locked fields with muted styling; `InfoHint` on complex fields

---

### Screen 11: Integrations

1. **Screen Name:** Integrations
2. **Route/URL:** `/learner/integrations`
3. **Purpose:** Connect/sync GitHub & Moodle; map evidence to competencies
4. **Target User/Role:** Learner
5. **How the user reaches this screen:** AppShell Evidence group; validation trail sync CTA; notification actions
6. **Main layout:** `AppShell` + `PageHeader` + vertical stack
7. **Header/navigation:** AppShell standard
8. **Sidebar/navigation items:** Evidence → Integrations (active)
9. **Main content:** `IntegrationSummary`; 3 connection cards; `GitHubEvidencePanel`; `LMSActivityPanel`; `CertificatesPanel`
10. **Components used:** All integration components (see catalog)
11. **Fields/input elements:** Repo search input (in GitHubEvidencePanel)
12. **Buttons/actions:** "Sync Portfolio"; Connect/Sync/Disconnect per integration; "Upload certificate" (stub); show more repos
13. **Tables/cards/lists:** Connection cards; repo rows; LMS activity rows
14. **Filters/search/sorting:** Repo search; language filter; pagination (6 per page)
15. **Data shown:** Connected sources count, linked repos, LMS records, last sync; GitHub username; Moodle email/host
16. **User interactions:** Connect/disconnect with confirm(); auto-sync on skill status change; link/unlink repos to skills
17. **Success states:** Toasts on connect, sync, link success
18. **Error states:** Moodle error display; sync/OAuth failure toasts
19. **Empty states:** Disconnected states in panels; certificate count hardcoded 0
20. **Loading states:** GitHub loading, Moodle loading, sync spinners
21. **Navigation to other screens:** `onOpenSkill` → `/learner/validation/:id`; GitHub OAuth flow
22. **Responsive/mobile behavior:** Connection cards `sm:grid-cols-2 lg:grid-cols-3`
23. **Important business rules:** GitHub disconnect removes synced data; Moodle disconnect keeps history; certificate upload is stub ("Upload coming soon")
24. **Existing UI/visual design details:** `IntegrationEmptyState` for disconnected sources; `StatusBadge` on connection status

---

### Screen 12: Practical Task

1. **Screen Name:** Practical Task (MCQ Assessment)
2. **Route/URL:** `/learner/task`
3. **Purpose:** AI-generated MCQ practical tasks per declared competency
4. **Target User/Role:** Learner
5. **How the user reaches this screen:** AppShell Assessment group; notification "Run task"
6. **Main layout:** `AppShell` + skill list cards + modal `Dialog`
7. **Header/navigation:** AppShell standard
8. **Sidebar/navigation items:** Assessment → Practical Task (active)
9. **Main content:** Per-skill task cards; dialog modes: start / mcq / result; result confirmation dialog
10. **Components used:** `PageHeader`, `StatusBadge`, `Card`, `Button`, `Label`, `RadioGroup`, `Dialog`
11. **Fields/input elements:** MCQ `RadioGroup` per question
12. **Buttons/actions:** Start task / Resume / View Attempt; Generate MCQ; Previous/Next/Submit; Close
13. **Tables/cards/lists:** Skill-bound task cards with status, score, last sync
14. **Filters/search/sorting:** None
15. **Data shown:** Per skill: name, domain, status, score if completed; in dialog: questions, timer, attempt history
16. **User interactions:** Timed MCQ; copy/cut/context menu blocked; localStorage state restore; auto-advance on timeout
17. **Success states:** Result dialog; toast on MCQ ready/submit; wallet message on submit
18. **Error states:** Generate error in dialog; submit failure toasts
19. **Empty states:** No explicit empty skills message (maps all skills)
20. **Loading states:** Skills loading; task loading; generating MCQs spinner
21. **Navigation to other screens:** Self-contained (no outbound nav)
22. **Responsive/mobile behavior:** Skill rows `md:flex-row`; dialog `max-w-3xl max-h-[90vh]`
23. **Important business rules:** 10 questions (4 easy, 4 medium, 2 hard); locked attempts block new starts; completed view-only; answer keys never shown; Edge function `rapid-task` for generate/evaluate
24. **Existing UI/visual design details:** Timer display; `NO_COPY_PROPS` anti-cheat styling

---

### Screen 13–14: Validation Trail (List & Detail)

**List:** `/learner/validation` | **Detail:** `/learner/validation/:skillId`

1. **Screen Name:** Validation Trail
2. **Route/URL:** As above
3. **Purpose:** Pipeline status and evidence trail per competency
4. **Target User/Role:** Learner
5. **How the user reaches this screen:** AppShell (when skills exist); "View Pipeline" from competencies; integrations link
6. **Main layout:** `AppShell`; list = card grid; detail = pipeline + evidence table
7. **Header/navigation:** AppShell standard
8. **Sidebar/navigation items:** Assessment → Validation Trail (shown only when `skills.length > 0`)
9. **Main content:** List: `PipelineCard` grid; Detail: pipeline card, stages, stats, evidence table, linked repos
10. **Components used:** `PageHeader`, `StatusBadge`, `Card`, `Button`, `PipelineCard`, `Stat`
11. **Fields/input elements:** None
12. **Buttons/actions:** "Go to profile" (empty); "Open wallet record"; "Issue Verified Credential"; "Sync evidence"; pipeline cards clickable
13. **Tables/cards/lists:** Evidence rows table; linked GitHub repos list
14. **Filters/search/sorting:** None
15. **Data shown:** Pipeline stages from `PIPELINE_STAGES`; supporting records, reviews, dates, task results
16. **User interactions:** Click pipeline card for detail; external GitHub links
17. **Success states:** Credential issued (when wallet_ready/in_wallet)
18. **Error states:** Fallback summary on build failure (console.error only)
19. **Empty states:** No skills CTA to profile; no evidence sync message
20. **Loading states:** "Loading validation trail…"
21. **Navigation to other screens:** `/learner/profile`, `/learner/wallet`, `/learner/integrations`, detail/list toggle
22. **Responsive/mobile behavior:** List `md:grid-cols-2`; stats `lg:grid-cols-3`
23. **Important business rules:** "Issue Verified Credential" only when stage is `wallet_ready` or `in_wallet`
24. **Existing UI/visual design details:** Pipeline stage progress visualization; `StatusBadge` per stage

---

### Screen 15: Wallet

1. **Screen Name:** SIJIL Wallet
2. **Route/URL:** `/learner/wallet`
3. **Purpose:** Competency-centered wallet records with evidence packages and recruiter sharing
4. **Target User/Role:** Learner
5. **How the user reaches this screen:** AppShell Identity group; validation trail CTA
6. **Main layout:** `AppShell` + wallet hero + records grid + dialogs
7. **Header/navigation:** AppShell standard
8. **Sidebar/navigation items:** Identity → Wallet (active)
9. **Main content:** SIJIL Wallet card (DID, stats); Key material card; Competency records grid; evidence dialog; share dialog
10. **Components used:** `PageHeader`, `StatusBadge`, `InfoHint`, `Card`, `Button`, `Dialog`, `CompetencyShareDialog`, local sub-components
11. **Fields/input elements:** None (share dialog has its own fields)
12. **Buttons/actions:** Refresh (page reload); "View Evidence Package"; "Share with Recruiter"
13. **Tables/cards/lists:** Competency record cards with badges, task result, evidence count
14. **Filters/search/sorting:** None
15. **Data shown:** Holder DID; record count, passed tasks, evidence items; per-record competency details; evidence modal sections (GitHub/LMS/practical/peer/teacher)
16. **User interactions:** Open evidence modal; open share dialog
17. **Success states:** Share dialog success toasts
18. **Error states:** Destructive error text in records card
19. **Empty states:** "No competency wallet records yet. Submit a practical task…"
20. **Loading states:** Profile/records loading
21. **Navigation to other screens:** Share generates `/recruiter/verify/:token` (no direct link to credential detail routes)
22. **Responsive/mobile behavior:** Hero `lg:grid-cols-3`; records `md:grid-cols-2`; modal `max-w-4xl`
23. **Important business rules:** API records merged with DB-derived records by competencyId; two wallet paradigms exist (wallet page vs credential routes)
24. **Existing UI/visual design details:** `--gradient-credential` styling on hero card; mono DID display

---

### Screen 16: Peer Reviews

1. **Screen Name:** Peer Reviews
2. **Route/URL:** `/learner/peer-reviews`
3. **Purpose:** Manage contributor invitations, trust signals, review evidence
4. **Target User/Role:** Learner
5. **How the user reaches this screen:** AppShell Identity group; "Manage reviews" from competencies
6. **Main layout:** `AppShell` + multi-card dashboard + invite dialog
7. **Header/navigation:** AppShell standard
8. **Sidebar/navigation items:** Identity → Peer Reviews (active)
9. **Main content:** Trust stats; project contributors; trust labels; invitations list; contributor review invitations; reviews list
10. **Components used:** `PageHeader`, `StatusBadge`, `Card`, `Button`, `Input`, `Label`, `Select`, `Dialog`, `ReviewCard`
11. **Fields/input elements:** Invite dialog: contact email (read-only if known), skill select
12. **Buttons/actions:** Import existing review; Send/Resend invite; Copy link; Verify contributor (toast only)
13. **Tables/cards/lists:** Review cards; invitation rows; contributor rows; 6 trust metric cards
14. **Filters/search/sorting:** None
15. **Data shown:** Trust metrics; projects with contributors; invitation statuses; merged reviews from DB, wallet, GitHub PRs
16. **User interactions:** Project/skill selects; quick send vs dialog invite; clipboard copy; import GitHub reviews
17. **Success states:** Invite sent/resend toasts
18. **Error states:** Load failure toasts; backend required toasts for import
19. **Empty states:** No skills/projects banners; "No peer reviews yet"; "No contributors found"
20. **Loading states:** "Loading your reviews…"
21. **Navigation to other screens:** Generated links to `/review/request/:token`, `/review/invite/:token`
22. **Responsive/mobile behavior:** Stats `grid-cols-2 md:grid-cols-6`; main `lg:grid-cols-3`
23. **Important business rules:** Only verified project contributors invitable; learner's own GitHub excluded; email required; resend locks recipient; SIJIL never shows Expert/Intermediate/Beginner labels
24. **Existing UI/visual design details:** Star rating display in reviews; amber warning on identity verification

---

### Screen 17: Credential Details

1. **Screen Name:** Credential Details
2. **Route/URL:** `/learner/credential/:id`
3. **Purpose:** Full VC-style credential record with supporting GitHub evidence
4. **Target User/Role:** Learner
5. **How the user reaches this screen:** **Not found in code** — no inbound links from WalletPage; route exists for manual/direct access
6. **Main layout:** `AppShell` + hero credential card + 2-column detail grid
7. **Header/navigation:** AppShell standard
8. **Sidebar/navigation items:** None specific (standard learner nav)
9. **Main content:** Credential overview; Supporting records (GitHub repos); Reviews & endorsements; Linked assessments; Metadata sidebar + actions
10. **Components used:** `PageHeader`, `StatusBadge`, `FieldRow`, `Card`, `Button`
11. **Fields/input elements:** None
12. **Buttons/actions:** Back to wallet; View proof; Share; Export VC JSON-LD (**no handler — non-functional**)
13. **Tables/cards/lists:** GitHub repo evidence list; hardcoded endorsement/assessment placeholders
14. **Filters/search/sorting:** None
15. **Data shown:** Credential id, name, issuer, types, verification, attestation, DID fields, skill-matched repos
16. **User interactions:** External GitHub links
17. **Success states:** N/A
18. **Error states:** "Credential not found" + back button
19. **Empty states:** No repo evidence message
20. **Loading states:** Credentials hook loading
21. **Navigation to other screens:** `/learner/wallet`, `/learner/credential/:id/proof`, `/learner/credential/:id/share`
22. **Responsive/mobile behavior:** `lg:grid-cols-3`
23. **Important business rules:** Repo match via language tokens; endorsements/assessments are **hardcoded placeholder data**
24. **Existing UI/visual design details:** `--gradient-credential` hero styling

---

### Screen 18: Credential Proof

1. **Screen Name:** Credential Proof
2. **Route/URL:** `/learner/credential/:id/proof`
3. **Purpose:** Display cryptographic proof metadata; simulate local verification
4. **Target User/Role:** Learner
5. **How the user reaches this screen:** From Credential Details
6. **Main layout:** `AppShell` + proof card + sidebar verify card
7. **Header/navigation:** AppShell standard
8. **Sidebar/navigation items:** Standard learner nav
9. **Main content:** Proof object fields; Verify proof panel; "What this proves" explainer
10. **Components used:** `PageHeader`, `StatusBadge`, `FieldRow`, `Card`, `Button`
11. **Fields/input elements:** None
12. **Buttons/actions:** Back; Copy proof hash; "Verify proof" (client-side mock)
13. **Tables/cards/lists:** None
14. **Filters/search/sorting:** None
15. **Data shown:** Proof type, cryptosuite, DIDs, truncated proofValue; **hardcoded** `created: "2026-04-18T09:30:14Z"`
16. **User interactions:** Copy hash; verify toggles UI + toast
17. **Success states:** "Proof verified" toast (mock)
18. **Error states:** Not found state
19. **Empty states:** N/A
20. **Loading states:** Credentials loading
21. **Navigation to other screens:** Back → credential details
22. **Responsive/mobile behavior:** `lg:grid-cols-3`
23. **Important business rules:** Verification is **demonstration UI only** — not full DID/crypto verify
24. **Existing UI/visual design details:** Mono font for hash values

---

### Screen 19: Selective Disclosure

1. **Screen Name:** Selective Disclosure / Share Credential
2. **Route/URL:** `/learner/credential/:id/share`
3. **Purpose:** Choose disclosed fields and generate recruiter verification link
4. **Target User/Role:** Learner
5. **How the user reaches this screen:** From Credential Details
6. **Main layout:** `AppShell` + 2-column grid
7. **Header/navigation:** AppShell standard
8. **Sidebar/navigation items:** Standard learner nav
9. **Main content:** Fields to disclose (switches); Verifier preview + share actions
10. **Components used:** `PageHeader`, `StatusBadge`, `Card`, `Button`, `Switch`
11. **Fields/input elements:** 10 configurable toggle switches
12. **Buttons/actions:** Back; Copy link; Save & share; QR (**stub — "coming soon"**); Revoke
13. **Tables/cards/lists:** Visible/hidden field preview lists
14. **Filters/search/sorting:** None
15. **Data shown:** 10 fields with values; share URL `/recruiter/verify/:token`
16. **User interactions:** Toggle fields; save/revoke presentation
17. **Success states:** Presentation saved/revoked toasts; link copied toast
18. **Error states:** Toast if DB id not found
19. **Empty states:** Preview: "Nothing selected to disclose"
20. **Loading states:** Credentials loading
21. **Navigation to other screens:** Back → details; share URL → public verify page
22. **Responsive/mobile behavior:** `lg:grid-cols-2`
23. **Important business rules:** Token per credential; 90-day expiry; defaults: core fields on, sensitive off
24. **Existing UI/visual design details:** Switch toggles with live preview update

---

### Screen 20–21: GitHub OAuth (Prepare & Callback)

**Prepare:** `/auth/github/prepare` | **Callback:** `/auth/github/callback`

1. **Screen Name:** GitHub OAuth Flow
2. **Purpose:** Connect GitHub account; exchange OAuth code; sync portfolio
3. **Target User/Role:** Learner (prepare requires auth; callback processes token)
4. **How the user reaches this screen:** From integrations, complete profile, my profile OAuth buttons
5. **Main layout:** Full-screen centered text (no AppShell)
6. **Main content:** Status messages during OAuth processing
7. **Components used:** None (minimal UI)
8. **API calls:** Prepare: hidden iframe to github.com/logout; Callback: `completeGitHubOAuth`, `syncGitHubPortfolio`, edge functions
9. **Navigation:** Return to stored `returnTo` with `?github=connected` or `?github=error`
10. **Business rules:** Prepare clears GitHub session for shared devices; 2s delay before redirect; no context → `/learner/integrations`

---

### Screen 22: Institution Dashboard

1. **Screen Name:** Institution Attestation Dashboard
2. **Route/URL:** `/institution/dashboard`
3. **Purpose:** Attestation overview with inline approve/reject
4. **Target User/Role:** Institution
5. **How the user reaches this screen:** Post-login home; AppShell nav; back buttons from detail pages
6. **Main layout:** `AppShell role="institution"` + `PageHeader` + summary cards + lists
7. **Header/navigation:** AppShell institution header
8. **Sidebar/navigation items:** Dashboard (active), Student Management, Attestation Queue
9. **Main content:** 4 summary cards; pending requests list; recently approved/rejected (max 5 each)
10. **Components used:** `AppShell`, `PageHeader`, `StatusBadge`, `Card`, `Button`, `SummaryCard`, `ListCard`, `CompetencyBlock`
11. **Fields/input elements:** None
12. **Buttons/actions:** "Open Attestation Queue"; per row Approve, Reject, View evidence package
13. **Tables/cards/lists:** Pending list with MCQ %, evidence counts; approved/rejected lists
14. **Filters/search/sorting:** Client-side status split
15. **Data shown:** Pending/approved/rejected counts; institution name; per-request learner, competency, evidence summary
16. **User interactions:** Inline approve/reject; click row for detail
17. **Success states:** Approve toast: "Credential issued to learner wallet"
18. **Error states:** Not found in inline handlers (hook may toast)
19. **Empty states:** Empty pending/approved/rejected sections
20. **Loading states:** Hook loading state
21. **Navigation to other screens:** `/institution/queue`, `/institution/attestation-request/:id`
22. **Responsive/mobile behavior:** Summary cards 4-column grid
23. **Important business rules:** Dashboard reject uses **hardcoded** feedback "Rejected by institution reviewer." (unlike detail page)
24. **Existing UI/visual design details:** Summary card color coding by status

---

### Screen 23: Attestation Queue

1. **Screen Name:** Attestation Queue
2. **Route/URL:** `/institution/queue`
3. **Purpose:** Searchable, filterable table of all attestation requests
4. **Target User/Role:** Institution
5. **How the user reaches this screen:** AppShell nav; dashboard CTA
6. **Main layout:** `AppShell` + `PageHeader` + filter card + `Table`
7. **Header/navigation:** AppShell standard
8. **Sidebar/navigation items:** Attestation Queue (active)
9. **Main content:** Search input; filter pills; full data table
10. **Components used:** `PageHeader`, `Input`, `Button`, `Table`, `StatusBadge`
11. **Fields/input elements:** Search input
12. **Buttons/actions:** Filter pills (All, Pending, Approved, Rejected); row Open button
13. **Tables/cards/lists:** Table columns: Learner, Email, Competency, Domain, MCQ %, Evidence, Submitted, Status, Action
14. **Filters/search/sorting:** Text search across learner/email/competency/domain/institution; status filter; sort by newest submitted
15. **Data shown:** All attestation requests for institution
16. **User interactions:** Search typing; filter selection; row click
17. **Success states:** N/A (read-only)
18. **Error states:** Not found in code
19. **Empty states:** Empty table when no matches
20. **Loading states:** Hook loading
21. **Navigation to other screens:** `/institution/attestation-request/:id`
22. **Responsive/mobile behavior:** Table may scroll horizontally
23. **Important business rules:** Filtered by institution name match via hook
24. **Existing UI/visual design details:** Filter pill active state styling

---

### Screen 24: Attestation Request Detail

1. **Screen Name:** Attestation Request Detail
2. **Route/URL:** `/institution/attestation-request/:id`
3. **Purpose:** Full evidence package review with approve/reject decision
4. **Target User/Role:** Institution
5. **How the user reaches this screen:** Dashboard, queue row click
6. **Main layout:** `AppShell` + 3-column grid (2 content + 1 decision sidebar)
7. **Header/navigation:** AppShell standard
8. **Sidebar/navigation items:** Standard institution nav
9. **Main content:** Learner card; Competency card; Evidence summary; MCQ result (with JSON dumps); Full evidence package JSON; Decision sidebar
10. **Components used:** `PageHeader`, `StatusBadge`, `Card`, `Button`, `Textarea`
11. **Fields/input elements:** Institution feedback textarea (required for rejection)
12. **Buttons/actions:** Back to dashboard; Approve / Reject (pending only, disabled while busy)
13. **Tables/cards/lists:** Evidence count breakdowns
14. **Filters/search/sorting:** None
15. **Data shown:** Full learner profile snippet; competency details; MCQ % with 70% threshold; raw JSON evidence
16. **User interactions:** Write feedback; approve/reject
17. **Success states:** Decision recorded; shows reviewedAt + feedback
18. **Error states:** Reject blocked without feedback (toast); not-found state
19. **Empty states:** N/A
20. **Loading states:** Request loading; busy during decision
21. **Navigation to other screens:** `/institution/dashboard`, `/institution/queue`
22. **Responsive/mobile behavior:** 3-column collapses on smaller screens
23. **Important business rules:** 70% MCQ threshold display; reject requires non-empty trimmed feedback
24. **Existing UI/visual design details:** JSON code blocks for evidence dumps

---

### Screen 25: Institution Validation Trail

1. **Screen Name:** Institution Validation Trail
2. **Route/URL:** `/institution/attestation/:id/validation`
3. **Purpose:** Read-only validation/evidence trail for attestation context
4. **Target User/Role:** Institution
5. **How the user reaches this screen:** **Not found in code** — no inbound navigation links from other institution pages
6. **Main layout:** `AppShell` + header + summary cards + evidence list
7. **Components used:** `StatusBadge`, stat cards, evidence row grid
8. **Buttons/actions:** Back to attestation request; Refresh (**disabled placeholder**)
9. **Data shown:** Supporting records, reviews, dates, contributing sources, evidence rows
10. **Business rules:** Read-only; no approve/reject
11. **Navigation:** Back only

---

### Screen 26: Student Management

1. **Screen Name:** Student Management
2. **Route/URL:** `/institution/students`
3. **Purpose:** View learners derived from attestation requests
4. **Target User/Role:** Institution
5. **How the user reaches this screen:** AppShell nav
6. **Main layout:** `AppShell` + info card + table + recent requests
7. **Components used:** `PageHeader`, `Card`, `Button`, native `<table>`, `StatusBadge`
8. **Buttons/actions:** Refresh
9. **Tables/cards/lists:** Table: Name, Email, Competency, Domain, MCQ %, Status, Submitted; recent 5 requests
10. **Data shown:** Derived student rows from attestation requests
11. **Empty states:** Empty table
12. **Business rules:** "Provision new accounts through your institution onboarding flow when available" — no provisioning UI in frontend
13. **Navigation:** Read-only view

---

### Screen 27: Recruiter Search

1. **Screen Name:** Search Candidates
2. **Route/URL:** `/recruiter/search`
3. **Purpose:** Skill-based candidate search with multi-select compare
4. **Target User/Role:** Recruiter
5. **How the user reaches this screen:** Post-login home; AppShell nav; back from summary/compare
6. **Main layout:** `AppShell role="recruiter"` + search card + 2-column candidate grid
7. **Header/navigation:** AppShell recruiter header
8. **Sidebar/navigation items:** Search Candidates (active), Compare
9. **Main content:** Skill search input; quick-filter chips; candidate cards with checkboxes
10. **Components used:** `AppShell`, `PageHeader`, `Input`, `Button`, `Card`, `Badge`, `Checkbox`
11. **Fields/input elements:** Skill search input
12. **Buttons/actions:** Search (no-op — live filter); Compare (N) when ≥2 selected; Open summary per card; clear selection
13. **Tables/cards/lists:** Candidate cards with attestation badge, skills, evidence counts
14. **Filters/search/sorting:** Live text search on skill name/domain; quick chips (React, Node, Python, PostgreSQL, Docker); **decorative** badges "Verification: Verified" and "Has credential: Yes" (not functional filters)
15. **Data shown:** All candidates from `useCandidates()` hook
16. **User interactions:** Type search; select up to 4 candidates; open summary
17. **Success states:** N/A
18. **Error states:** Not found in code
19. **Empty states:** No matching candidates
20. **Loading states:** Candidates hook loading
21. **Navigation to other screens:** `/recruiter/candidate/:id`, `/recruiter/compare?ids=&skill=`
22. **Responsive/mobile behavior:** 2-column card grid
23. **Important business rules:** Compare max 4 candidates; selected cards get `ring-2 ring-primary`
24. **Existing UI/visual design details:** Quick-filter chip styling

---

### Screen 28: Candidate Summary

1. **Screen Name:** Candidate Summary
2. **Route/URL:** `/recruiter/candidate/:id`
3. **Purpose:** Evidence-backed candidate verification (no wallet access)
4. **Target User/Role:** Recruiter
5. **How the user reaches this screen:** Search card click; compare table Open button
6. **Main layout:** `AppShell` + profile header + 2/3 main + 1/3 sidebar
7. **Components used:** `PageHeader`, `StatusBadge`, `FieldRow`, `Card`, `Button`, `ReviewCard`
8. **Buttons/actions:** Back to search; Open & verify presentation
9. **Data shown:** Verified skills; presentation token/claims; peer reviews (first 5); trust signals; "Wallet not accessible" badge
10. **Business rules:** Uses first presentation only; SIJIL does not assign expert/intermediate labels
11. **Navigation:** `/recruiter/search`, `/recruiter/verify/:token?from=`

---

### Screen 29: Candidate Compare

1. **Screen Name:** Compare Candidates
2. **Route/URL:** `/recruiter/compare?ids=id1,id2&skill=optional`
3. **Purpose:** Side-by-side candidate and skill matrix comparison
4. **Target User/Role:** Recruiter
5. **How the user reaches this screen:** Search Compare button with selected IDs
6. **Main layout:** `AppShell` + two comparison tables
7. **Tables:** Candidate snapshot table; Skill-level comparison matrix
8. **Business rules:** Requires ≥2 IDs in URL; skill set from union of selected candidates
9. **Empty states:** Shows empty state with back button if <2 IDs
10. **Navigation:** Back to search; Open per candidate

---

### Screen 30: Public Presentation Viewer

1. **Screen Name:** Competency Presentation View / Recruiter Verify
2. **Route/URL:** `/recruiter/verify/:token`
3. **Purpose:** Public selective-disclosure presentation viewer (no auth)
4. **Target User/Role:** Public (typically Recruiter via shared link)
5. **How the user reaches this screen:** Shared link from learner wallet/share flows; candidate summary verify button
6. **Main layout:** Standalone page (`max-w-6xl`) — **no AppShell, no auth**
7. **Components used:** `PageHeader`, `StatusBadge`, `FieldRow`, `Card`, `DisclosureSection`
8. **Buttons/actions:** Back (`navigate(-1)`); Run Verification; Copy Link
9. **API calls:** `getPublicPresentationApi(token)`; `verifyPublicPresentationApi(token)`
10. **Data shown:** Proof result badges; disclosed payload sections; verification summary; metadata; privacy notice
11. **Success states:** Valid Proof badge after verification
12. **Error states:** Error message on load/verify failure; expired/revoked states
13. **Business rules:** Only disclosed fields shown; hidden fields not accessible; recruiter never accesses wallet

---

### Screen 31: Peer Review Invite Form

1. **Screen Name:** Peer Review Form
2. **Route/URL:** `/review/invite/:token`
3. **Purpose:** Secure peer review submission for invited reviewers
4. **Target User/Role:** Public reviewer (token-authenticated)
5. **How the user reaches this screen:** Invitation link from learner peer reviews
6. **Main layout:** Minimal shell with SIJIL header link to `/`; `max-w-3xl`
7. **Page states:** loading | invalid | used | expired | identity_check | review_form | submitted
8. **Forms:** Identity verification (email, GitHub username); Review form (confidence 1–5, decision, comment)
9. **API calls:** `findInvitationByToken`, `submitSecurePeerReview`, `markInvitationUsed`
10. **Business rules:** Token single-use; identity fields validated against invitation

---

### Screen 32: Context Review Request Form

1. **Screen Name:** Context Review Form
2. **Route/URL:** `/review/request/:token`
3. **Purpose:** Context-verified review (REST API-backed)
4. **Target User/Role:** Public reviewer
5. **How the user reaches this screen:** Context review invitation link
6. **Guard:** Requires `isApiEnabled()` — otherwise "Review service unavailable"
7. **Forms:** Identity (email + GitHub); Review (rating 1–5, recommendation, feedback)
8. **API calls:** `getReviewRequestByTokenApi`, `submitContextReviewApi`
9. **Business rules:** Identity re-checked on submit; amber warning banner on review form

---

### Screen 33: Not Found

1. **Screen Name:** 404 Not Found
2. **Route/URL:** `*` (catch-all)
3. **Purpose:** Unknown route fallback
4. **Layout:** Centered, `bg-muted`, `min-h-screen`
5. **Content:** "404" heading; "Oops! Page not found"; `<a href="/">Return to Home</a>`
6. **Behavior:** Logs pathname to `console.error` on mount
7. **Note:** Uses plain anchor, not React Router `Link`

---

## 8. User Journeys & Flows

### 8.1 New Self-Signup Learner Flow

```
/ (Auth Entry)
  → Select Learner → Sign up tab
  → Fill signup form → signupLearner()
  → /learner/complete-profile (SelfSignupCompleteProfile)
  → Complete form + connect GitHub (required)
  → /learner/profile (Competencies Dashboard)
  → Declare competency(ies)
  → /learner/integrations (Connect GitHub/Moodle)
  → /learner/task (Complete MCQ practical)
  → /learner/validation (View pipeline)
  → Institution attestation (backend workflow)
  → /learner/wallet (Wallet record appears)
  → Share with recruiter → /recruiter/verify/:token
```

### 8.2 Institution-Provisioned Learner Flow

```
Email with /student/activate?token=
  → Preview student info
  → Set password → activateStudentAccount()
  → Auto sign-in
  → /learner/complete-profile (InstitutionCompleteProfile)
  → Complete form + GitHub
  → /learner/profile
  → [Same competency/evidence/assessment flow as self-signup]
```

### 8.3 Learner Login Flow

```
/login/learner (or / with Learner + Sign in)
  → Email + password
  → verifyLearnerAccess()
  → If incomplete profile → /learner/complete-profile
  → If complete → /learner/profile
  → If wrong role/not activated/no profile → sign out + error toast
```

### 8.4 Learner Registration Flow

```
/signup/learner (or / with Learner + Sign up)
  → Full name, email, password, confirm
  → Zod validation → signupLearner()
  → /learner/complete-profile
```

### 8.5 Forgot Password Flow

```
LearnerSignInForm → "Forgot password?"
  → ForgotPasswordDialog
  → supabase.auth.resetPasswordForEmail()
  → Redirect to /login/learner (via email link)
```

### 8.6 Recruiter Login Flow

```
/ → Select Recruiter → /login/recruiter
  OR direct /login/recruiter
  → Work email + password
  → verifyRecruiterAccess()
  → /recruiter/search
```

### 8.7 Institution Login Flow

```
/login/institution
  → Institution email + password
  → verifyInstitutionAccess() (active profile required)
  → /institution/dashboard
```

### 8.8 Main Browsing Flow (Learner)

```
/learner/profile (hub)
  ↔ /learner/my-profile
  ↔ /learner/integrations
  ↔ /learner/task
  ↔ /learner/validation (/validation/:skillId)
  ↔ /learner/wallet
  ↔ /learner/peer-reviews
```

All via AppShell sidebar navigation groups.

### 8.9 Search Flow (Recruiter)

```
/recruiter/search
  → Type skill name or click quick-filter chip
  → Live filter candidates
  → Click "Open summary" → /recruiter/candidate/:id
  → OR select 2–4 candidates → "Compare" → /recruiter/compare?ids=
```

### 8.10 Create/Add Flow (Competency)

```
/learner/profile
  → "Declare competency" dialog
  → Enter name, domain, description
  → addSkill() → toast success
  → Skill appears in list with "Skill Claimed" status
  → Validation Trail nav item appears in AppShell
```

### 8.11 Edit/Update Flow (Competency)

```
/learner/profile
  → Click Edit on skill row
  → Dialog pre-filled
  → updateSkill() → toast
```

### 8.12 Delete Flow (Competency)

```
/learner/profile
  → Click Delete on skill row
  → removeSkill() (with competency cleanup)
  → toast confirmation
```

### 8.13 GitHub Integration Flow

```
/learner/integrations (or complete profile)
  → Connect GitHub
  → /auth/github/prepare (session clear)
  → GitHub OAuth authorize
  → /auth/github/callback (code exchange + sync)
  → Return to integrations with ?github=connected
  → Link repos to skills
```

### 8.14 Practical Task / Assessment Flow

```
/learner/task
  → Select skill → Start task
  → Generate MCQ (edge function rapid-task)
  → Answer 10 timed questions
  → Submit → result stored
  → Triggers attestation request to institution (backend)
```

### 8.15 Institution Attestation Flow

```
/institution/dashboard (see pending)
  OR /institution/queue (search/filter)
  → Open request detail
  → Review evidence package + MCQ result
  → Approve → credential issued to learner wallet
  OR Reject → requires feedback text
```

### 8.16 Peer Review Invitation Flow

```
/learner/peer-reviews
  → Select project contributor + skill
  → Send invite → token generated
  → Reviewer opens /review/invite/:token
  → Identity check → submit review
  → Review appears in learner peer reviews
```

### 8.17 Selective Disclosure / Share Flow

```
/learner/wallet → "Share with Recruiter" (CompetencyShareDialog)
  OR /learner/credential/:id/share
  → Toggle disclosed fields
  → Save presentation → token generated
  → Copy link: /recruiter/verify/:token
  → Recruiter opens public viewer
  → Run Verification
```

### 8.18 Admin Flow

**Not found in frontend UI.** Admin role exists in backend middleware only.

### 8.19 Logout Flow

```
AppShell → Sign out
  → supabase.auth.signOut()
  → Learner → /
  → Recruiter → /login/recruiter
  → Institution → /login/institution
  → Clears GitHub connection state (useAuth)
```

### 8.20 Landing / Marketing Flow

```
/about
  → Scroll sections or nav anchors
  → CTA → / (auth entry)
```

### 8.21 Context Review Flow (API-backed)

```
/learner/peer-reviews → send context review invite
  → Reviewer opens /review/request/:token
  → Requires backend API enabled
  → Identity + review submission via REST API
```

---

## 9. API & Data Layer Reference

### 9.1 Frontend API Services (`src/services/api/`)

| Module | Backend paths |
|--------|---------------|
| `client.ts` | Base HTTP client with JWT |
| `skills.api.ts` | `/skills/*` |
| `evidence.api.ts` | `/evidence/*` |
| `github.api.ts` | `/integrations/github/*` |
| `credentials.api.ts` | `/credentials/*` |
| `attestation.api.ts` | `/attestation/*` |
| `recruiter.api.ts` | `/recruiter/*` |
| `reviews.api.ts` | `/reviews/*` |
| `peer-review.api.ts` | `/peer-review/*` |
| `wallet.api.ts` | `/wallet/*`, `/public/presentations/*` |
| `institution-students.api.ts` | `/institution/students` |
| `student-activation.api.ts` | `/student-activation/*` |

### 9.2 Backend Endpoints Summary (67 total)

See `backend/src/routes/index.ts` for full mount paths:
- `/api/health` — public
- `/api/skills` — learner, admin
- `/api/evidence` — learner, admin
- `/api/attestation` — institution, admin
- `/api/credentials` — mixed auth
- `/api/recruiter` — recruiter, admin
- `/api/integrations` (alias `/api/github`) — learner, admin
- `/api/reviews` — public token + learner
- `/api/peer-review` — public token + learner
- `/api/institution` — institution, admin
- `/api/student-activation` — public token
- `/api/wallet` — learner, admin
- `/api/public/presentations` — public

### 9.3 Key Hooks

| Hook | Purpose |
|------|---------|
| `useAuth` | Session, roles, signOut |
| `useLearnerProfile` | Learner profile data |
| `useDeclaredSkills` | Skills CRUD |
| `useCredentials` | Credential records |
| `usePeerReviews` | Peer review data |
| `useCandidates` | Recruiter candidate list |
| `useInstitutionAttestationRequests` | Institution queue |
| `useGitHub` | GitHub connection + repos |

### 9.4 Supabase Edge Functions (referenced in frontend)

- `rapid-task` — MCQ generation/evaluation
- `github-oauth-start`, `github-oauth-callback`, `github-sync` — GitHub OAuth
- `moodle-sync` — LMS sync

---

## 10. Known Gaps & Inconsistencies

| Item | Status |
|------|--------|
| `src/pages/recruiter/CredentialView.tsx` | **Implemented but NOT registered in router.** Live verify uses `CompetencyPresentationView` at `/recruiter/verify/:token` |
| Institution Validation Trail (`/institution/attestation/:id/validation`) | Route exists; **no inbound navigation links** from other institution pages |
| Credential detail routes (`/learner/credential/:id/*`) | Routes exist; **no inbound links from WalletPage** |
| Dashboard reject vs Request Detail reject | Dashboard uses **hardcoded feedback**; detail page requires **custom feedback** |
| Recruiter Search decorative filters | "Verification: Verified" and "Has credential: Yes" badges are **display only**, not wired |
| Certificate upload | **Stub** — toast "Upload coming soon" |
| Credential Details endorsements/assessments | **Hardcoded placeholder data** |
| Credential Proof verification | **Mock client-side only** |
| Selective Disclosure QR button | **Stub** — "coming soon" toast |
| Export VC JSON-LD button | **No handler** |
| Institution Validation Trail Refresh button | **Disabled placeholder** |
| AppShell mobile sidebar | Fixed `w-64` sidebar with **no hamburger/collapse** — mobile behavior needs clarification |
| Admin role UI | **Not found in frontend** |
| Student provisioning UI for institutions | **Not found** — copy references future onboarding flow |
| ZKP/Blockchain integration | **Future** — README mentions mock SHA-256 hashes only |
| Two wallet data paradigms | `WalletPage` uses `fetchWalletCompetencyRecords`; credential routes use `useCredentials()` — different data paths |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Generated from | Source code inspection of `src/`, `backend/src/routes/`, `supabase/` |
| Route source of truth | `src/App.tsx` |
| Total registered screens | 34 (+ 1 unrouted) |
| Last analyzed | Repository state at documentation time |

---

*End of PROJECT_LOGICAL_MODEL.md*
