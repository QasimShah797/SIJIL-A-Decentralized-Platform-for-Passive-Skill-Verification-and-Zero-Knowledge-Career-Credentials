import { addWeeks, format, startOfWeek, subWeeks } from "date-fns";
import type { PeerReview, ReviewInvitation } from "@/lib/sijil-data";
import type { ContributorRow } from "@/lib/db/peer-review-page";

export type TrustFilter = "all" | "high" | "medium";
export type ContributorViewFilter = "all" | "reviewed" | "invited" | "pending";
export type ReviewSort = "newest" | "oldest" | "trust";

export type TrustMixSlice = {
  key: TrustFilter | "blocked" | "other";
  name: string;
  value: number;
  color: string;
};

export type SourceSlice = {
  name: string;
  origin: "imported" | "sijil";
  value: number;
  color: string;
};

export type WeekPoint = {
  week: string;
  label: string;
  reviews: number;
  highTrust: number;
};

export type CoverageStats = {
  reviewed: number;
  invited: number;
  pending: number;
  ineligible: number;
  total: number;
  percent: number;
};

export type NextActionKind = "invite" | "resend" | "import" | "healthy";

export type NextAction = {
  kind: NextActionKind;
  title: string;
  detail: string;
  count: number;
};

const TRUST_COLORS = {
  high: "#059669",
  medium: "#023E8A",
  blocked: "#dc2626",
  other: "#94a3b8",
};

function asDate(review: PeerReview & Record<string, unknown>): Date {
  const raw = review.date ?? review.created_at;
  const date = new Date(typeof raw === "string" ? raw : Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function isStaleInvite(iso: string | null | undefined, days = 7): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return false;
  return Date.now() - time > days * 86_400_000;
}

export function trustMix(reviews: PeerReview[]): TrustMixSlice[] {
  const high = reviews.filter((review) => review.trustWeight === "High Trust").length;
  const medium = reviews.filter((review) => review.trustWeight === "Medium Trust").length;
  const blocked = reviews.filter((review) => review.trustWeight === "Blocked").length;
  const other = Math.max(0, reviews.length - high - medium - blocked);
  return [
    { key: "high", name: "High trust", value: high, color: TRUST_COLORS.high },
    { key: "medium", name: "Medium trust", value: medium, color: TRUST_COLORS.medium },
    { key: "blocked", name: "Blocked", value: blocked, color: TRUST_COLORS.blocked },
    { key: "other", name: "Unweighted", value: other, color: TRUST_COLORS.other },
  ].filter((slice) => slice.value > 0);
}

export function sourceMix(reviews: PeerReview[]): SourceSlice[] {
  const counts = new Map<string, { origin: "imported" | "sijil"; value: number }>();
  for (const review of reviews) {
    const origin = review.imported ? "imported" : "sijil";
    const source = review.imported ? (review.source || "Imported") : "SIJIL";
    const current = counts.get(source);
    counts.set(source, { origin, value: (current?.value ?? 0) + 1 });
  }
  const palette = ["#023E8A", "#14b8a6", "#f97316", "#7c3aed", "#0891b2"];
  return [...counts.entries()]
    .sort((a, b) => b[1].value - a[1].value)
    .map(([name, item], index) => ({
      name,
      origin: item.origin,
      value: item.value,
      color: palette[index % palette.length],
    }));
}

export type ReviewMeasure = {
  id: string;
  label: string;
  value: string;
  detail: string;
};

export type ReviewGlanceStat = {
  id: string;
  label: string;
  value: string;
  suffix?: string;
};

export type ReviewGlance = {
  headline: string;
  stats: ReviewGlanceStat[];
};

function reviewRating(review: PeerReview): number | null {
  const raw = (review as PeerReview & Record<string, unknown>).rating;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value) || value < 1 || value > 5) return null;
  return value;
}

function reviewerKey(review: PeerReview): string {
  const extra = review as PeerReview & Record<string, unknown>;
  const name = review.reviewerName
    || (typeof extra.reviewer_name === "string" ? extra.reviewer_name : "");
  return name.trim().toLowerCase() || review.id;
}

function daysSince(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return date.toLocaleDateString();
}

/** One-line status plus a few figures, without repeating the same story in every cell. */
export function reviewGlance(
  reviews: PeerReview[],
  coverage: CoverageStats,
  invitations: ReviewInvitation[],
): ReviewGlance {
  const ratings = reviews.map(reviewRating).filter((value): value is number => value != null);
  const average = ratings.length
    ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1)
    : null;
  const withRecommendation = reviews.filter((review) => Boolean(review.recommendation));
  const recommended = withRecommendation.filter((review) => review.recommendation === "Recommended").length;
  const highTrust = reviews.filter((review) => review.trustWeight === "High Trust").length;
  const asked = coverage.reviewed + coverage.invited;
  const quiet = invitations.filter(
    (invitation) => invitation.status !== "Completed" && isStaleInvite(invitation.sentAt),
  ).length;

  let headline = "No reviews yet.";
  if (reviews.length === 0 && asked === 0) {
    headline = "No reviews yet. Invite a contributor to start.";
  } else if (asked > 0 && average) {
    headline = `${coverage.reviewed} of ${asked} invited people replied, averaging ${average}/5.`;
  } else if (asked > 0) {
    headline = `${coverage.reviewed} of ${asked} invited people replied.`;
  } else if (average) {
    headline = `${reviews.length} reviews on file, averaging ${average}/5.`;
  } else if (reviews.length > 0) {
    headline = `${reviews.length} reviews on file.`;
  }

  return {
    headline,
    stats: [
      {
        id: "reply",
        label: "Replied",
        value: asked === 0 ? "—" : `${coverage.reviewed}/${asked}`,
      },
      {
        id: "score",
        label: "Score",
        value: average ?? "—",
        suffix: average ? "/5" : undefined,
      },
      {
        id: "recommend",
        label: "Recommended",
        value: withRecommendation.length === 0 ? "—" : `${recommended}/${withRecommendation.length}`,
      },
      {
        id: "trust",
        label: "High trust",
        value: reviews.length === 0 ? "—" : `${highTrust}/${reviews.length}`,
      },
      {
        id: "quiet",
        label: "No reply",
        value: String(quiet),
      },
    ],
  };
}

/** Plain counts that explain what the review set is actually showing. */
export function reviewMeasures(
  reviews: PeerReview[],
  coverage: CoverageStats,
  invitations: ReviewInvitation[],
): ReviewMeasure[] {
  const ratings = reviews.map(reviewRating).filter((value): value is number => value != null);
  const average = ratings.length
    ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1)
    : null;
  const withRecommendation = reviews.filter((review) => Boolean(review.recommendation));
  const recommended = withRecommendation.filter((review) => review.recommendation === "Recommended").length;
  const verified = reviews.filter((review) => review.contextStatus === "Context Verified").length;
  const highTrust = reviews.filter((review) => review.trustWeight === "High Trust").length;
  const reviewers = new Set(reviews.map(reviewerKey)).size;
  const skills = new Set(reviews.map((review) => review.skill).filter(Boolean)).size;
  const latest = reviews.map(asDate).sort((a, b) => b.getTime() - a.getTime())[0];
  const eligible = Math.max(0, coverage.total - coverage.ineligible);
  const asked = coverage.reviewed + coverage.invited;
  const quiet = invitations.filter(
    (invitation) => invitation.status !== "Completed" && isStaleInvite(invitation.sentAt),
  ).length;

  return [
    {
      id: "reply",
      label: "Reply rate",
      value: asked === 0 ? "—" : `${coverage.reviewed} of ${asked}`,
      detail: asked === 0
        ? "No contributor on this project has been invited yet."
        : `${coverage.reviewed} invited ${coverage.reviewed === 1 ? "person replied" : "people replied"}. ${coverage.invited} still waiting.`,
    },
    {
      id: "verified",
      label: "Context verified",
      value: reviews.length === 0 ? "—" : `${verified} of ${reviews.length}`,
      detail: "Reviews tied to a confirmed project and a real contributor, not an anonymous note.",
    },
    {
      id: "score",
      label: "Average score",
      value: average ? `${average} / 5` : "—",
      detail: ratings.length
        ? `Mean rating across ${ratings.length} scored ${ratings.length === 1 ? "review" : "reviews"}.`
        : "No numeric ratings have been submitted yet.",
    },
    {
      id: "recommend",
      label: "Recommended",
      value: withRecommendation.length === 0 ? "—" : `${recommended} of ${withRecommendation.length}`,
      detail: "Reviewers who said the skill is strong enough to stand on.",
    },
    {
      id: "trust",
      label: "High trust",
      value: reviews.length === 0 ? "—" : `${highTrust} of ${reviews.length}`,
      detail: "From a teacher, mentor, teammate, or verified project collaborator.",
    },
    {
      id: "coverage",
      label: "Project coverage",
      value: eligible === 0 ? "—" : `${coverage.reviewed} of ${eligible}`,
      detail: eligible === 0
        ? "This project has no eligible contributors yet."
        : `${coverage.pending} still need an invite. ${coverage.invited} are waiting on a reply.`,
    },
    {
      id: "people",
      label: "Distinct reviewers",
      value: String(reviewers),
      detail: reviewers === 0
        ? "No one has written a review yet."
        : `${reviewers} different ${reviewers === 1 ? "person has" : "people have"} reviewed this work.`,
    },
    {
      id: "skills",
      label: "Skills attested",
      value: String(skills),
      detail: skills === 0
        ? "No declared skill has a review yet."
        : `${skills} ${skills === 1 ? "competency has" : "competencies have"} at least one review.`,
    },
    {
      id: "latest",
      label: "Last review",
      value: latest ? daysSince(latest) : "—",
      detail: latest
        ? `The newest review arrived ${daysSince(latest).toLowerCase()}.`
        : "Nothing has been submitted yet.",
    },
    {
      id: "quiet",
      label: "Quiet invites",
      value: String(quiet),
      detail: quiet === 0
        ? "No invite has gone unanswered for 7 days."
        : `${quiet} ${quiet === 1 ? "invite has" : "invites have"} had no reply for 7 days or more.`,
    },
  ];
}

export function reviewsByWeek(reviews: PeerReview[], weeks = 8): WeekPoint[] {
  const start = startOfWeek(subWeeks(new Date(), weeks - 1), { weekStartsOn: 1 });
  return Array.from({ length: weeks }, (_, index) => {
    const weekStart = addWeeks(start, index);
    const weekEnd = addWeeks(start, index + 1);
    const inWeek = reviews.filter((review) => {
      const date = asDate(review);
      return date >= weekStart && date < weekEnd;
    });
    return {
      week: weekStart.toISOString(),
      label: format(weekStart, "d MMM"),
      reviews: inWeek.length,
      highTrust: inWeek.filter((review) => review.trustWeight === "High Trust").length,
    };
  });
}

export type ContributorGroup = "action" | "waiting" | "done" | "skip";

export type ContributorStory = {
  group: ContributorGroup;
  label: string;
  hint: string;
  action: "invite" | "resend" | "view" | "none";
  stale: boolean;
};

export function contributorStory(row: ContributorRow): ContributorStory {
  const stale = row.status === "Invite Sent" && isStaleInvite(row.lastInviteAt);
  const invitedOn = row.lastInviteAt
    ? new Date(row.lastInviteAt).toLocaleDateString()
    : null;

  if (row.status === "Review Received") {
    return {
      group: "done",
      label: "Reviewed",
      hint: "",
      action: "view",
      stale: false,
    };
  }
  if (row.status === "Imported Review Found") {
    return {
      group: "done",
      label: "Imported",
      hint: "",
      action: "view",
      stale: false,
    };
  }
  if (stale) {
    return {
      group: "action",
      label: "No reply yet",
      hint: invitedOn ? `Sent ${invitedOn}` : "",
      action: "resend",
      stale: true,
    };
  }
  if (row.status === "Invite Sent") {
    return {
      group: "waiting",
      label: "Waiting",
      hint: invitedOn ? `Sent ${invitedOn}` : "",
      action: "resend",
      stale: false,
    };
  }
  if (row.status === "Review Pending") {
    return {
      group: "action",
      label: "Needs invite",
      hint: row.contributor.email ? "" : "Add email to invite",
      action: "invite",
      stale: false,
    };
  }
  return {
    group: "skip",
    label: "Not eligible",
    hint: "",
    action: "none",
    stale: false,
  };
}

export function groupContributorRows(rows: ContributorRow[]) {
  const groups: Record<ContributorGroup, ContributorRow[]> = {
    action: [],
    waiting: [],
    done: [],
    skip: [],
  };
  for (const row of rows) {
    groups[contributorStory(row).group].push(row);
  }
  return groups;
}
export function coverageFromRows(rows: ContributorRow[]): CoverageStats {
  const reviewed = rows.filter(
    (row) => row.status === "Review Received" || row.status === "Imported Review Found",
  ).length;
  const invited = rows.filter((row) => row.status === "Invite Sent").length;
  const pending = rows.filter((row) => row.status === "Review Pending").length;
  const ineligible = rows.filter((row) => row.status === "Not a Project Contributor").length;
  const eligible = Math.max(1, rows.length - ineligible);
  return {
    reviewed,
    invited,
    pending,
    ineligible,
    total: rows.length,
    percent: Math.round((reviewed / eligible) * 100),
  };
}

export function nextAction(
  rows: ContributorRow[],
  reviews: PeerReview[],
  invitations: ReviewInvitation[],
): NextAction {
  const pending = rows.filter((row) => row.status === "Review Pending");
  if (pending.length > 0) {
    return {
      kind: "invite",
      title: `Invite ${pending.length} remaining`,
      detail: "",
      count: pending.length,
    };
  }

  const stale = rows.filter(
    (row) => row.status === "Invite Sent" && isStaleInvite(row.lastInviteAt),
  );
  const staleInvites = invitations.filter(
    (invitation) => invitation.status !== "Completed" && isStaleInvite(invitation.sentAt),
  );
  const staleCount = Math.max(stale.length, staleInvites.length);
  if (staleCount > 0) {
    return {
      kind: "resend",
      title: `Resend ${staleCount} quiet invite${staleCount === 1 ? "" : "s"}`,
      detail: "",
      count: staleCount,
    };
  }

  if (reviews.length === 0) {
    return {
      kind: "import",
      title: "Import GitHub reviews",
      detail: "",
      count: 0,
    };
  }

  return {
    kind: "healthy",
    title: "Coverage looks healthy",
    detail: "Keep mapping new evidence if you declare another competency.",
    count: 0,
  };
}

export function filterReviews(
  reviews: PeerReview[],
  origin: "all" | "imported" | "sijil",
  trust: TrustFilter,
  search: string,
  sort: ReviewSort,
  sourceName: string = "all",
): PeerReview[] {
  const query = search.trim().toLowerCase();
  const filtered = reviews.filter((review) => {
    if (sourceName !== "all") {
      const reviewSource = review.imported ? (review.source || "Imported") : "SIJIL";
      if (reviewSource !== sourceName) return false;
    } else {
      if (origin === "imported" && !review.imported) return false;
      if (origin === "sijil" && review.imported) return false;
    }
    if (trust === "high" && review.trustWeight !== "High Trust") return false;
    if (trust === "medium" && review.trustWeight !== "Medium Trust") return false;
    if (!query) return true;
    const extra = review as PeerReview & Record<string, unknown>;
    const haystack = [
      review.reviewerName,
      extra.reviewer_name,
      review.skill,
      review.comment,
      extra.review_text,
      review.projectName,
      extra.repository_name,
    ]
      .filter((value) => typeof value === "string")
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  const rank = (weight: PeerReview["trustWeight"]) => {
    if (weight === "High Trust") return 3;
    if (weight === "Medium Trust") return 2;
    if (weight === "Blocked") return 0;
    return 1;
  };

  return [...filtered].sort((a, b) => {
    if (sort === "trust") return rank(b.trustWeight) - rank(a.trustWeight);
    const delta = asDate(a).getTime() - asDate(b).getTime();
    return sort === "oldest" ? delta : -delta;
  });
}

export function filterContributorRows(
  rows: ContributorRow[],
  view: ContributorViewFilter,
): ContributorRow[] {
  if (view === "reviewed") {
    return rows.filter(
      (row) => row.status === "Review Received" || row.status === "Imported Review Found",
    );
  }
  if (view === "invited") return rows.filter((row) => row.status === "Invite Sent");
  if (view === "pending") return rows.filter((row) => row.status === "Review Pending");
  return rows;
}
