import {
  BadgeCheck,
  Check,
  Circle,
  Fingerprint,
  GitBranch,
  ShieldCheck,
} from "lucide-react";

const NAVY = "#063B82";

/** Professional developer at work — career-tech, not education */
const HERO_PHOTO =
  "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=900&q=85&auto=format&fit=crop";

export function AboutHeroProduct() {
  return (
    <div className="about-hero-visual-wrap">
      <div className="about-hero-photo-frame">
        <img
          src={HERO_PHOTO}
          alt="Software professional reviewing code and building aggregated work evidence"
          className="about-hero-photo-img"
          width={900}
          height={1125}
          fetchPriority="high"
        />
        <div className="about-hero-photo-overlay" aria-hidden />
        <div className="about-hero-photo-caption">
          <span className="about-hero-photo-caption-dot" aria-hidden />
          Real work · Real evidence · Assembled proof
        </div>
      </div>

      <div className="about-hero-credential-float">
        <div className="about-mock-panel about-hero-credential-card overflow-hidden">
          <div className="about-hero-credential-header">
            <div className="flex items-center justify-between">
              <span className="about-badge-verified">
                <ShieldCheck className="h-3 w-3" />
                SIJIL Record
              </span>
              <Fingerprint className="h-4 w-4 text-white/70" aria-hidden />
            </div>
            <p className="mt-3 text-base font-bold text-white">Aaiza Islam</p>
            <p className="text-[11px] text-white/75">Professional Identity · Frontend Development</p>
          </div>

          <div className="about-mock-body space-y-2.5">
            <span className="inline-block rounded-md bg-[#eef2f6] px-2 py-0.5 text-[11px] font-semibold text-[#102A43]">
              TypeScript
            </span>

            <div className="space-y-1.5 text-[11px]">
              {[
                { label: "Evidence Linked", done: true },
                { label: "Assessment Complete", done: true },
                { label: "Aggregation", pending: true },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-[#64748B]">{row.label}</span>
                  <span
                    className={
                      row.done
                        ? "about-status-done flex items-center gap-1 font-semibold"
                        : "about-status-active flex items-center gap-1 font-semibold"
                    }
                  >
                    {row.done ? (
                      <>
                        <Check className="h-3 w-3" /> Done
                      </>
                    ) : (
                      <>
                        <Circle className="h-2 w-2 fill-current" /> Pending
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div>
              <div className="mb-1 flex justify-between text-[10px] text-[#64748B]">
                <span>Credential Progress</span>
                <span className="font-semibold tabular-nums" style={{ color: NAVY }}>
                  87%
                </span>
              </div>
              <div className="about-progress-track">
                <div className="about-progress-fill" style={{ width: "87%" }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AboutEvidencePanel() {
  const items = [
    { label: "GitHub Repository", status: "done" as const },
    { label: "Practical Submission", status: "done" as const },
    { label: "Assessment", status: "done" as const },
    { label: "Peer Review", status: "pending" as const },
  ];

  return (
    <div className="about-mock-panel">
      <div className="about-mock-chrome">
        <span className="about-mock-dot" />
        <span className="about-mock-dot" />
        <span className="about-mock-dot" />
        <span className="about-mock-chrome-title">Evidence Records</span>
      </div>
      <div className="about-mock-body about-mock-list">
        {items.map((item) => (
          <div key={item.label} className="about-mock-list-row">
            <div className="flex items-center gap-2.5">
              {item.label.includes("GitHub") && <GitBranch className="h-4 w-4 about-icon-muted" />}
              <span className="about-mock-list-label">{item.label}</span>
            </div>
            <span
              className={
                item.status === "done"
                  ? "about-status-done text-xs font-semibold"
                  : "about-status-pending text-xs font-semibold"
              }
            >
              {item.status === "done" ? "✓ Connected" : "○ Pending"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AboutIdentityCard() {
  return (
    <div className="about-identity-card relative z-10">
      <div className="relative z-10">
        <span className="about-badge-verified">
          <BadgeCheck className="h-3 w-3" />
          SIJIL Record
        </span>
        <p className="mt-4 text-2xl font-bold about-text-primary">Aaiza Islam</p>
        <p className="mt-1 text-sm font-semibold about-text-navy">Frontend Development</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["TypeScript", "JavaScript"].map((s) => (
            <span key={s} className="about-tag about-tag-strong">
              {s}
            </span>
          ))}
        </div>

        <div className="about-identity-stats">
          {[
            { val: "2", label: "Competencies" },
            { val: "6", label: "Evidence Records" },
            { val: "1", label: "Assessment" },
          ].map(({ val, label }) => (
            <div key={label}>
              <div className="about-identity-stat-val">{val}</div>
              <div className="about-identity-stat-label">{label}</div>
            </div>
          ))}
        </div>

        <p className="about-mock-meta-label mt-4">Professional Identity</p>
        <div className="about-did-block">did:key:z6MkhaXgBZkv9C7oR3nF2pL8wQdT4sV1xY9...</div>
      </div>
    </div>
  );
}

type ShowcaseTab = "competencies" | "evidence" | "validation" | "profile" | "wallet";

export function AboutShowcasePreview({ tab }: { tab: ShowcaseTab }) {
  const content: Record<ShowcaseTab, { title: string; subtitle: string; rows: string[] }> = {
    competencies: {
      title: "Competencies",
      subtitle: "Declared skills with aggregation status",
      rows: [
        "TypeScript — Aggregation in progress",
        "React — Evidence linked",
        "Node.js — Declared",
      ],
    },
    evidence: {
      title: "Evidence Records",
      subtitle: "Linked proof from real work",
      rows: [
        "GitHub: react-dashboard — Linked",
        "Practical Task: API Design — Submitted",
        "Project: E-commerce — Linked",
      ],
    },
    validation: {
      title: "Evidence Trail",
      subtitle: "Transparent evidence aggregation pipeline",
      rows: [
        "Evidence linked — Complete",
        "Assessment — Complete",
        "Aggregation — In progress",
      ],
    },
    profile: {
      title: "Professional Profile",
      subtitle: "Your evidence-backed professional identity",
      rows: ["2 aggregated competencies", "6 evidence records", "DID: did:key:z6Mk..."],
    },
    wallet: {
      title: "Digital Wallet",
      subtitle: "Portable credentials you control",
      rows: [
        "TypeScript Competency — Credential-ready",
        "Frontend Development — Active",
        "Share link — Selective disclosure",
      ],
    },
  };

  const { title, subtitle, rows } = content[tab];
  const navItems = ["Overview", "Competencies", "Evidence", "Evidence Trail", "Wallet"];

  return (
    <div className="about-showcase-frame">
      <div className="about-mock-chrome">
        <span className="about-mock-dot" />
        <span className="about-mock-dot" />
        <span className="about-mock-dot" />
        <span className="about-mock-chrome-title">SIJIL — {title}</span>
      </div>
      <div className="about-showcase-inner">
        <div className="about-showcase-sidebar">
          {navItems.map((item, i) => (
            <div
              key={item}
              className={`about-showcase-nav-item ${i === 1 ? "about-showcase-nav-item-active" : ""}`}
            >
              {item}
            </div>
          ))}
        </div>
        <div className="about-showcase-content">
          <h3 className="about-mock-title text-lg">{title}</h3>
          <p className="about-mock-subtitle">{subtitle}</p>
          <div className="mt-5 space-y-3">
            {rows.map((row) => (
              <div key={row} className="about-showcase-row">
                {row}
                <Check className="h-4 w-4 shrink-0 about-icon-teal" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AboutOrgsVerificationMini() {
  return (
    <div className="about-mock-panel mt-6">
      <div className="about-mock-body">
        <p className="about-mock-title">Candidate Evidence Profile</p>
        <p className="about-mock-subtitle">Aggregated competency review</p>
        <div className="mt-4 space-y-2">
          {[
            { label: "Evidence aggregated", pct: 100 },
            { label: "Assessment recorded", pct: 100 },
            { label: "Confidence score", pct: 87 },
          ].map(({ label, pct }) => (
            <div key={label}>
              <div className="mb-1 flex justify-between text-[11px]">
                <span className="about-text-secondary">{label}</span>
                <span className="font-semibold tabular-nums about-text-navy">{pct}%</span>
              </div>
              <div className="about-progress-track">
                <div className="about-progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
