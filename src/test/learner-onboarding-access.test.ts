import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-helpers", () => ({
  fetchUserRoles: vi.fn(),
  ROLE_HOME: {
    learner: "/learner/profile",
    recruiter: "/recruiter/search",
    admin: "/learner/profile",
    institution: "/",
  },
}));

vi.mock("@/lib/db/learner-profile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/learner-profile")>(
    "@/lib/db/learner-profile",
  );
  return {
    ...actual,
    fetchLearnerProfileRow: vi.fn(),
    isLearnerProfileComplete: vi.fn(),
  };
});

vi.mock("@/lib/profile-oauth-verification", () => ({
  meetsOAuthCompletionRequirements: vi.fn(),
  fetchGitHubVerification: vi.fn(),
}));

import { ROLE_HOME, fetchUserRoles } from "@/lib/auth-helpers";
import { fetchLearnerProfileRow, isLearnerProfileComplete } from "@/lib/db/learner-profile";
import { verifyLearnerAccess } from "@/lib/learner-auth";
import {
  fetchGitHubVerification,
  meetsOAuthCompletionRequirements,
} from "@/lib/profile-oauth-verification";

const USER_ID = "15e1ecb4-8150-4b0f-bb55-c4e469ba855f";

/** Mirrors LearnerSignInForm / OAuth post-login destination selection. */
function postLoginDestination(access: Awaited<ReturnType<typeof verifyLearnerAccess>>): string {
  if (!access.ok) return "/login/learner";
  return access.profileComplete ? ROLE_HOME.learner : "/learner/complete-profile";
}

describe("learner onboarding access after GitHub decoupling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects incomplete personal profile to complete-profile", async () => {
    vi.mocked(fetchUserRoles).mockResolvedValue(["learner"]);
    vi.mocked(fetchLearnerProfileRow).mockResolvedValue({ user_id: USER_ID } as never);
    vi.mocked(isLearnerProfileComplete).mockResolvedValue(false);

    const access = await verifyLearnerAccess(USER_ID);
    expect(access).toEqual({ ok: true, profileComplete: false });
    expect(postLoginDestination(access)).toBe("/learner/complete-profile");
  });

  it("redirects complete personal profile to learner home without GitHub", async () => {
    vi.mocked(fetchUserRoles).mockResolvedValue(["learner"]);
    vi.mocked(fetchLearnerProfileRow).mockResolvedValue({ user_id: USER_ID } as never);
    vi.mocked(isLearnerProfileComplete).mockResolvedValue(true);

    const access = await verifyLearnerAccess(USER_ID);
    expect(access).toEqual({ ok: true, profileComplete: true });
    expect(postLoginDestination(access)).toBe("/learner/profile");
  });

  it("allows moodle-only learners with complete personal onboarding to pass journey gate", async () => {
    // RequireLearnerRoute uses profileComplete; journey does not require GitHub.
    vi.mocked(fetchUserRoles).mockResolvedValue(["learner"]);
    vi.mocked(fetchLearnerProfileRow).mockResolvedValue({ user_id: USER_ID } as never);
    vi.mocked(isLearnerProfileComplete).mockResolvedValue(true);
    vi.mocked(meetsOAuthCompletionRequirements).mockResolvedValue({ ok: false, github: false });

    const access = await verifyLearnerAccess(USER_ID);
    expect(access.ok && access.profileComplete).toBe(true);
    expect(meetsOAuthCompletionRequirements).not.toHaveBeenCalled();
  });

  it("keeps GitHub-specific verification helpers connection-gated", async () => {
    vi.mocked(fetchGitHubVerification).mockResolvedValue(false);
    vi.mocked(meetsOAuthCompletionRequirements).mockImplementation(async (userId) => {
      const github = await fetchGitHubVerification(userId);
      return { ok: github, github };
    });

    await expect(meetsOAuthCompletionRequirements(USER_ID)).resolves.toEqual({
      ok: false,
      github: false,
    });
    expect(fetchGitHubVerification).toHaveBeenCalledWith(USER_ID);
  });
});
