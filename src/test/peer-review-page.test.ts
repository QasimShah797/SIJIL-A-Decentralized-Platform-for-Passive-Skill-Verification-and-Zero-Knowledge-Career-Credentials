import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PeerReview } from "@/lib/sijil-data";
import { fetchDeclaredSkills } from "@/lib/db/skills";
import { fetchInvitations, fetchPeerReviews } from "@/lib/db/peer-reviews";
import { fetchProjectsFromDb } from "@/lib/db/projects";
import { isApiEnabled } from "@/services/api/client";
import { getPeerReviewProjectsApi, getPeerReviewsApi } from "@/services/api/peer-review.api";
import { loadPeerReviewPageData, type PeerReviewProject } from "@/lib/db/peer-review-page";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: [], error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/db/skills", () => ({ fetchDeclaredSkills: vi.fn() }));
vi.mock("@/lib/db/peer-reviews", () => ({
  fetchPeerReviews: vi.fn(),
  fetchInvitations: vi.fn(async () => []),
}));
vi.mock("@/lib/db/projects", () => ({ fetchProjectsFromDb: vi.fn(async () => []) }));
vi.mock("@/lib/db/github-evidence", () => ({ fetchLinkedProjectEvidence: vi.fn(async () => []) }));
vi.mock("@/lib/db/skill-cleanup", () => ({ cleanupOrphanedLearnerReviewData: vi.fn() }));
vi.mock("@/services/api/client", () => ({ isApiEnabled: vi.fn() }));
vi.mock("@/services/api/peer-review.api", () => ({
  getPeerReviewProjectsApi: vi.fn(),
  getPeerReviewsApi: vi.fn(),
}));

const SKILL = { id: "skill-typescript", name: "TypeScript" };

function review(id: string, skill = "TypeScript"): PeerReview {
  return {
    id,
    reviewerName: "Ada Lovelace",
    reviewerRole: "Project Collaborator",
    source: "GitHub",
    origin: "SIJIL",
    skill,
    evidenceLabel: skill,
    rating: 5,
    comment: "Careful implementation",
    date: "2026-10-17T00:00:00.000Z",
    contextStatus: "Context Verified",
    trustWeight: "High Trust",
    imported: false,
  };
}

function project(id: string): PeerReviewProject {
  return {
    id,
    name: id,
    source: "GitHub",
    evidenceLabel: id,
    linkedSkills: ["TypeScript"],
    contributors: [],
    skillLinks: [{ skillId: SKILL.id, skillName: "TypeScript" }],
  };
}

describe("peer-review page merge", () => {
  beforeEach(() => {
    vi.mocked(fetchDeclaredSkills).mockResolvedValue([SKILL] as never);
    vi.mocked(fetchInvitations).mockResolvedValue([]);
    vi.mocked(fetchProjectsFromDb).mockResolvedValue([project("local-project")] as never);
    vi.mocked(isApiEnabled).mockReturnValue(true);
  });

  it("merges API and local reviews by id and keeps local reviews the API omitted", async () => {
    vi.mocked(fetchPeerReviews).mockResolvedValue([
      review("shared-review"),
      review("local-only-review"),
    ]);
    vi.mocked(getPeerReviewsApi).mockResolvedValue([review("shared-review")]);
    vi.mocked(getPeerReviewProjectsApi).mockResolvedValue([
      project("shared-project"),
      project("api-project"),
    ]);
    vi.mocked(fetchProjectsFromDb).mockResolvedValue([
      project("shared-project"),
      project("local-project"),
    ] as never);

    const page = await loadPeerReviewPageData("learner-1");

    expect(page.reviews.map((item) => item.id)).toEqual(["shared-review", "local-only-review"]);
    expect(page.projects.map((item) => item.id)).toEqual([
      "shared-project",
      "api-project",
      "local-project",
    ]);
  });
});
