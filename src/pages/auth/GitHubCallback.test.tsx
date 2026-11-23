import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GitHubCallback from "./GitHubCallback";
import { loadGitHubOAuthContext, saveGitHubOAuthContext } from "@/lib/github-env";
import { completeGitHubOAuth } from "@/lib/github-integration";
import { completeGitHubPageSignIn } from "@/lib/github-signin";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: "learner" } } } })) } },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/github-integration", () => ({ completeGitHubOAuth: vi.fn() }));
vi.mock("@/lib/github-signin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/github-signin")>()),
  completeGitHubPageSignIn: vi.fn(),
}));
vi.mock("@/lib/oauth-signin", () => ({ completeOAuthLearnerSignIn: vi.fn() }));
vi.mock("@/lib/db/skills", () => ({ fetchDeclaredSkills: vi.fn() }));
vi.mock("@/lib/db/credentials", () => ({ fetchCredentials: vi.fn() }));

function ReturnPage() {
  return <h1>Complete Profile {new URLSearchParams(useLocation().search).get("github")}</h1>;
}

describe("GitHub account connection during onboarding", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    saveGitHubOAuthContext("fixture", window.location.origin + "/auth/github/callback", "learner", "nonce",
      { returnTo: "/learner/complete-profile", skipPortfolioSync: true });
  });

  afterEach(() => window.history.replaceState(null, "", "/"));

  it.each(["connected", "error"])("returns to the form after exchange result %s", async (result) => {
    const state = encodeURIComponent(btoa("learner.nonce"));
    const callback = "/auth/github/callback?code=fixture&state=" + state;
    window.history.replaceState(null, "", callback);
    vi.mocked(completeGitHubOAuth).mockImplementation(async () => {
      expect(loadGitHubOAuthContext()?.returnTo).toBe("/learner/complete-profile");
      if (result === "error") throw new Error("GitHub refused the exchange");
      return { github_username: "fixture" };
    });

    render(
      <MemoryRouter initialEntries={[callback]}>
        <Routes>
          <Route path="/auth/github/callback" element={<GitHubCallback />} />
          <Route path="/learner/complete-profile" element={<ReturnPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Complete Profile " + result })).toBeInTheDocument();
    expect(completeGitHubOAuth).toHaveBeenCalledWith("fixture", btoa("learner.nonce"));
    expect(completeGitHubPageSignIn).not.toHaveBeenCalled();
    expect(loadGitHubOAuthContext()).toBeNull();
  });
});

