import type { TooltipProps } from "recharts";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Github, GraduationCap, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CoverageStats,
  SourceSlice,
  WeekPoint,
} from "@/lib/peer-review-insights";

function ActivityTooltip({
  active,
  payload,
}: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as WeekPoint | undefined;
  if (!point) return null;

  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 shadow-md">
      <p className="text-[11px] text-[#64748b]">{point.label}</p>
      <p className="mt-0.5 text-sm font-semibold text-[#0f172a]">{point.reviews} reviews</p>
      <p className="text-[11px] text-[#0d9488]">{point.highTrust} high trust</p>
    </div>
  );
}

export function PeerReviewTrendChart({ compact, points }: { compact?: boolean; points: WeekPoint[] }) {
  const empty = points.every((point) => point.reviews === 0);
  const peak = Math.max(...points.map((point) => Math.max(point.reviews, point.highTrust)), 0);
  const yMax = Math.max(4, peak);

  return (
    <div className={compact ? "min-w-0" : "learner-stat-card p-5"}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[#023E8A]">Activity</p>
        <div className="flex gap-3 text-[10px] text-[#64748b]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#023E8A]" />
            Reviews
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#14b8a6]" />
            High trust
          </span>
        </div>
      </div>
      <div className="relative mt-3 h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="prReviewsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#023E8A" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#023E8A" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e2e8f0" vertical={false} strokeDasharray="3 6" />
            <XAxis
              dataKey="label"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              minTickGap={12}
            />
            <YAxis
              domain={[0, yMax]}
              allowDecimals={false}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip
              content={ActivityTooltip}
              cursor={{ stroke: "#023E8A", strokeWidth: 1, strokeDasharray: "4 4" }}
            />
            <Area
              type="monotone"
              dataKey="reviews"
              name="Reviews"
              stroke="#023E8A"
              fill="url(#prReviewsFill)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: "#023E8A", stroke: "#fff", strokeWidth: 2 }}
            />
            <Area
              type="monotone"
              dataKey="highTrust"
              name="High trust"
              stroke="#14b8a6"
              fill="none"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#14b8a6", stroke: "#fff", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded-full bg-white/90 px-3 py-1 text-[11px] text-[#94a3b8]">No activity yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

function sourceIcon(name: string, origin: SourceSlice["origin"]) {
  const label = name.toLowerCase();
  if (origin === "sijil" || label.includes("sijil")) {
    return <MessageSquare className="h-3.5 w-3.5" />;
  }
  if (label.includes("lms") || label.includes("moodle")) {
    return <GraduationCap className="h-3.5 w-3.5" />;
  }
  return <Github className="h-3.5 w-3.5" />;
}

export function PeerReviewSourceBars({
  slices,
  activeSource,
  onSelectSource,
  compact,
}: {
  slices: SourceSlice[];
  activeSource: string;
  onSelectSource: (source: string) => void;
  compact?: boolean;
}) {
  const max = Math.max(...slices.map((slice) => slice.value), 1);

  return (
    <div className={compact ? "min-w-0" : "learner-stat-card p-5"}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#023E8A]">Source</p>
        <button
          type="button"
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
            activeSource === "all"
              ? "bg-[#023E8A] text-white"
              : "text-[#023E8A] hover:bg-[#eff6ff]",
          )}
          onClick={() => onSelectSource("all")}
        >
          All
        </button>
      </div>

      {slices.length === 0 ? (
        <p className="text-xs text-[#94a3b8]">No data</p>
      ) : (
        <div className="space-y-2">
          {slices.map((slice) => {
            const selected = activeSource === slice.name;
            const percent = Math.max(8, Math.round((slice.value / max) * 100));
            return (
              <button
                key={slice.name}
                type="button"
                aria-pressed={selected}
                className={cn("pr-source-meter", selected && "is-on")}
                onClick={() => onSelectSource(selected ? "all" : slice.name)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn("pr-source-icon", selected && "is-on")}>
                      {sourceIcon(slice.name, slice.origin)}
                    </span>
                    <span className="truncate font-medium">{slice.name}</span>
                  </span>
                  <span className="tabular-nums font-semibold">{slice.value}</span>
                </span>
                <span className="pr-source-track">
                  <span
                    className="pr-source-fill"
                    style={{
                      width: `${percent}%`,
                      background: selected ? "#fff" : slice.color,
                    }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PeerReviewInsightsPanel({
  points,
  slices,
  activeSource,
  onSelectSource,
}: {
  points: WeekPoint[];
  slices: SourceSlice[];
  activeSource: string;
  onSelectSource: (source: string) => void;
}) {
  return (
    <div className="learner-stat-card mb-5 grid gap-6 p-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(240px,0.85fr)]">
      <PeerReviewTrendChart compact points={points} />
      <div className="min-w-0 lg:border-l lg:border-[#e2e8f0] lg:pl-6">
        <PeerReviewSourceBars
          compact
          slices={slices}
          activeSource={activeSource}
          onSelectSource={onSelectSource}
        />
      </div>
    </div>
  );
}

export function PeerReviewCoverageMeter({ coverage }: { coverage: CoverageStats }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const len = (coverage.percent / 100) * c;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2">
      <div className="relative h-16 w-16 shrink-0">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke="#023E8A"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${len} ${c}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-[#023E8A]">{coverage.percent}%</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[#0f172a]">Contributor coverage</p>
        <p className="mt-0.5 text-[11px] text-[#64748b]">
          {coverage.reviewed} reviewed · {coverage.pending} to invite
        </p>
      </div>
    </div>
  );
}
