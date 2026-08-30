/** High-fidelity marketing mockups — SIJIL brand #023E8A */

const BRAND = "#023E8A";
const BRAND_LIGHT = "#E8EEF7";

export function HeroHubIllustration() {
  const tags = [
    { label: "Python", x: 6, y: 22 },
    { label: "Coursera", x: 78, y: 12 },
    { label: "SQL", x: 82, y: 48 },
    { label: "GitHub", x: 10, y: 55 },
    { label: "Badges", x: 72, y: 78 },
    { label: "Project Mgmt", x: 18, y: 84 },
  ];

  return (
    <div className="relative mx-auto h-[380px] w-full max-w-[460px] sm:h-[420px]" aria-hidden>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 460 420">
        {tags.map((t) => (
          <line
            key={t.label}
            x1="230"
            y1="210"
            x2={230 + (t.x - 50) * 2.4}
            y2={210 + (t.y - 50) * 2.4}
            stroke="#d1d5db"
            strokeWidth="1"
          />
        ))}
      </svg>

      <div
        className="absolute left-1/2 top-1/2 z-10 w-[54%] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.25)] ring-1 ring-white/10"
        style={{ background: BRAND }}
      >
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-200">Verified Skills</p>
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-semibold text-emerald-400">Live</span>
        </div>
        <p className="mt-3 text-xl font-bold text-white">TypeScript</p>
        <p className="text-xs text-gray-300">Full-stack development</p>
        <div className="mt-4 space-y-2">
          {[
            { l: "GitHub repos", v: "4 linked" },
            { l: "LMS grades", v: "2 courses" },
            { l: "Practical task", v: "80% score" },
          ].map((r) => (
            <div key={r.l} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-[11px]">
              <span className="text-gray-300">{r.l}</span>
              <span className="font-medium text-white">{r.v}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2 border-t border-white/10 pt-3">
          <span className="rounded-md bg-white/95 px-2.5 py-1 text-[10px] font-semibold" style={{ color: BRAND }}>
            View proof
          </span>
          <span className="rounded-md border border-white/20 px-2.5 py-1 text-[10px] text-gray-300">Share</span>
        </div>
      </div>

      {tags.map((t) => (
        <div
          key={t.label}
          className="absolute z-20 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 shadow-md"
          style={{ left: `${t.x}%`, top: `${t.y}%`, transform: "translate(-50%, -50%)" }}
        >
          {t.label}
        </div>
      ))}
    </div>
  );
}

export function WalletDashboardMock() {
  const creds = [
    { name: "AWS Cloud Practitioner", org: "Amazon", status: "Verified" },
    { name: "TypeScript Fundamentals", org: "SIJIL", status: "Verified" },
    { name: "React Development", org: "Coursera", status: "In review" },
  ];

  return (
    <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_25px_60px_rgba(2,62,138,0.12)]">
      <div className="flex min-h-[320px]">
        <div className="hidden w-14 shrink-0 flex-col items-center gap-4 border-r border-gray-100 bg-gray-50 py-5 sm:flex">
          {["⌂", "◫", "◎", "↗"].map((icon, i) => (
            <div
              key={icon}
              className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm ${
                i === 1 ? "text-[#023E8A]" : "text-gray-400"
              }`}
              style={i === 1 ? { background: BRAND_LIGHT } : undefined}
            >
              {icon}
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-gray-900">Hi, Alex 👋</p>
              <p className="text-xs text-gray-500">Your credential wallet</p>
            </div>
            <span className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: BRAND }}>
              Share Wallet
            </span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              { label: "Verified Skills", val: "12" },
              { label: "Badges", val: "8" },
              { label: "Evidence", val: "24" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                <p className="text-lg font-bold text-gray-900">{s.val}</p>
                <p className="text-[10px] text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Recent credentials</p>
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-100">
              {creds.map((c) => (
                <div key={c.name} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">{c.name}</p>
                    <p className="text-[11px] text-gray-500">{c.org}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      c.status === "Verified" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function VerifiedSkillsCardMock() {
  const skills = [
    { name: "Data Science", date: "Mar 2026", verified: true },
    { name: "Python", date: "Jan 2026", verified: true },
    { name: "Machine Learning", date: "Pending", verified: false },
  ];

  return (
    <div className="lp-card mx-auto max-w-md overflow-hidden shadow-lg">
      <div className="border-b border-gray-100 bg-gray-50 px-5 py-3">
        <p className="text-sm font-semibold text-gray-900">Verified Skills</p>
      </div>
      <ul className="divide-y divide-gray-100">
        {skills.map((s) => (
          <li key={s.name} className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="font-semibold text-gray-900">{s.name}</p>
              <p className="text-xs text-gray-500">{s.date}</p>
            </div>
            {s.verified ? (
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-xs text-white"
                style={{ background: BRAND }}
              >
                ✓
              </span>
            ) : (
              <span className="h-6 w-6 rounded-full border-2 border-gray-200" />
            )}
          </li>
        ))}
      </ul>
      <div className="border-t px-5 py-4" style={{ borderColor: "#c5d4eb", background: BRAND_LIGHT }}>
        <div className="lp-card p-4 shadow-md" style={{ borderColor: "#c5d4eb" }}>
          <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: BRAND }}>
            New credential
          </p>
          <p className="mt-1 text-base font-bold text-gray-900">Data Science</p>
          <p className="mt-1 text-xs text-gray-500">Issued · Verified on-chain</p>
        </div>
      </div>
    </div>
  );
}

export function BarChartMock() {
  const bars = [
    { h: 72, color: "#e5e7eb" },
    { h: 96, color: "#c5d4eb" },
    { h: 120, color: "#7da3d4" },
    { h: 148, color: "linear-gradient(180deg,#023E8A,#14b8a6)" },
  ];

  return (
    <div className="lp-card mx-auto flex max-w-md items-end justify-center gap-5 px-10 pb-8 pt-10">
      {bars.map((b, i) => (
        <div key={i} className="flex flex-col items-center gap-2">
          <div
            className="w-11 rounded-t-md"
            style={{
              height: b.h,
              background: b.color,
            }}
          />
        </div>
      ))}
    </div>
  );
}

export function CredentialCardMock() {
  return (
    <div className="lp-card mx-auto max-w-sm overflow-hidden shadow-xl">
      <div className="px-6 py-8" style={{ background: "var(--sijil-brand-gradient-btn)" }}>
        <p className="text-xs font-semibold uppercase tracking-widest text-white/70">Digital Credential</p>
        <p className="mt-2 text-2xl font-bold text-white">Full-Stack Engineer</p>
        <p className="mt-1 text-sm text-white/80">Issued to Alex Chen</p>
      </div>
      <div className="space-y-3 p-6">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Issue date</span>
          <span className="font-medium text-gray-900">Aug 29, 2026</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Evidence linked</span>
          <span className="font-medium text-emerald-600">6 sources</span>
        </div>
        <div className="mt-4 flex h-16 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 text-xs text-gray-400">
          QR Verification Code
        </div>
        <button type="button" className="lp-btn-gradient mt-2 w-full">
          View Verification
        </button>
      </div>
    </div>
  );
}
