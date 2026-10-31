import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { PeerReview } from "@/lib/sijil-data";
import { loadPeerReviewPageData } from "@/lib/db/peer-review-page";
import { isApiEnabled } from "@/services/api/client";
import { getPeerReviewStatsApi } from "@/services/api/peer-review.api";
import { fetchWalletCompetencyRecords } from "@/lib/db/wallet-competency-records";
import { fetchGitHubPrReviewsForUser } from "@/lib/github-pr-reviews";
import PeerReviewsPage from "@/pages/learner/PeerReviews";

vi.mock("@/components/sijil/LearnerWorkspaceShell", () => ({
  LearnerWorkspaceShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "learner-1" } }),
}));

vi.mock("@/hooks/useLearnerData", () => ({
  useDeclaredSkills: () => ({
    skills: [{ id: "skill-typescript", name: "TypeScript" }],
    loading: false,
  }),
}));

vi.mock("@/lib/db/peer-review-page", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/peer-review-page")>("@/lib/db/peer-review-page");
  return {
    ...actual,
    loadPeerReviewPageData: vi.fn(),
    sendPeerReviewInvite: vi.fn(),
  };
});

vi.mock("@/services/api/client", () => ({ isApiEnabled: vi.fn() }));
vi.mock("@/services/api/peer-review.api", () => ({
  getPeerReviewStatsApi: vi.fn(),
  getPeerReviewContributorsApi: vi.fn(),
  createPeerReviewInviteApi: vi.fn(),
  resendPeerReviewInvitationApi: vi.fn(),
}));
vi.mock("@/services/api/reviews.api", () => ({ importExternalReviewsApi: vi.fn() }));
vi.mock("@/lib/db/wallet-competency-records", () => ({ fetchWalletCompetencyRecords: vi.fn() }));
vi.mock("@/lib/github-pr-reviews", () => ({ fetchGitHubPrReviewsForUser: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

const localReview: PeerReview = {
  id: "local-review",
  reviewerName: "Nida Khan",
  reviewerRole: "Project Collaborator",
  source: "GitHub",
  origin: "SIJIL",
  skill: "TypeScript",
  evidenceLabel: "TypeScript",
  rating: 5,
  comment: "Clear contribution",
  date: "2026-10-17T00:00:00.000Z",
  contextStatus: "Context Verified",
  trustWeight: "High Trust",
  imported: false,
};

describe("peer reviews without a linked project", () => {
  beforeEach(() => {
    vi.mocked(isApiEnabled).mockReturnValue(true);
    vi.mocked(fetchWalletCompetencyRecords).mockResolvedValue([]);
    vi.mocked(fetchGitHubPrReviewsForUser).mockResolvedValue({ reviews: [], errors: [] } as never);
    vi.mocked(getPeerReviewStatsApi).mockResolvedValue({
      totalReviews: 0,
      contextVerified: 0,
      imported: 0,
      fromSIJILForm: 0,
      highTrust: 0,
      pendingInvites: 0,
    });
    vi.mocked(loadPeerReviewPageData).mockResolvedValue({
      projects: [],
      reviews: [localReview],
      legacyInvitations: [],
      contextRequests: [],
    });
  });

  it("shows the local review and an integrations prompt instead of the empty project screen", async () => {
    render(
      <MemoryRouter>
        <PeerReviewsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Nida Khan")).toBeTruthy();
    expect(screen.getByText("Link a GitHub repository to request contributor reviews for a project.")).toBeTruthy();
    expect(screen.queryByText("No linked projects")).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Reviews/ })).toHaveTextContent("1");
    });
  });
});
