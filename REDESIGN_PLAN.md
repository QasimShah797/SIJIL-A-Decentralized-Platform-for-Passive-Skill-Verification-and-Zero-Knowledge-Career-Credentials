# SIJIL Redesign Plan

> Inspired by [Credly](https://info.credly.com/), [PreCognise](https://www.precognise.co/), [CredLyr](https://www.credlyr.com/), and [MUI UI Foundations Kit](https://mui.com/store/items/ui-foundations-kit-saas-admin-dashboard-template/) SaaS patterns.

## 1. Project analysis (current state)

| Area | Status |
|------|--------|
| **Roles** | Learner + Recruiter only (Institution removed) |
| **Stack** | React + Vite + Tailwind + shadcn/ui + Supabase |
| **Design tokens** | Navy / verified green / slate — partial UX baseline |
| **Landing** | 6 sections, basic hero mock, no trust stats or marketplace framing |
| **Auth** | Role tiles + segmented tabs — functional, not premium |
| **Workspace** | AppShell with mobile drawer — MUI SaaS polish incomplete |
| **Credentials** | Wallet + public verify — credential hero exists, trust layer weak |

## 2. Reference → SIJIL mapping

| Reference | Pattern borrowed | SIJIL application |
|-----------|------------------|-------------------|
| **Credly** | Network stats, digital credential hero, enterprise trust | Trust stats bar, credential mock card, verified badges |
| **PreCognise** | Verification-first marketplace, trust layer, dual audience | Trust layer section, Learner/Recruiter split, evidence flow diagram |
| **CredLyr** | Minimal verify UI, enterprise security copy | Public presentation viewer, proof metadata layout |
| **MUI UI Foundations** | SaaS sidebar, harmonic typography, stats strips | AppShell refinement, ScoreboardStrip, PageHeader rhythm |

## 3. Design system (v3 — Violet + Sand)

| Token | Light | Role |
|-------|-------|------|
| **Primary** | `hsl(265 58% 42%)` violet | CTAs, links, active nav |
| **Background** | `hsl(38 32% 95%)` warm sand | Page canvas — not white |
| **Card** | `hsl(40 38% 98%)` cream | Elevated surfaces |
| **Secondary** | Lavender mist | Section alternates, strips |
| **Success** | Teal | Verified / machine-checked only |
| **Credential foil** | Violet → plum → teal gradient | Digital credential cards |
| **Auth panels** | `--gradient-auth` | Login/signup left panels |

Dark mode uses warm plum-charcoal (not blue-black).

## 4–9. Implementation phases

| Phase | Scope | Status |
|-------|-------|--------|
| 4 | Landing + auth | In progress |
| 5 | Learner workspace chrome | In progress |
| 6 | Recruiter workspace chrome | In progress |
| 7 | Credentials / public verify | In progress |
| 8 | Responsive pass | Built into components |
| 9 | `npm run build` verification | Required |

## Screen inventory (active)

- Public: `/`, `/about`, auth routes, `/recruiter/verify/:token`, review forms
- Learner: profile, integrations, task, validation, wallet, credentials, peer reviews
- Recruiter: search, candidate, compare
