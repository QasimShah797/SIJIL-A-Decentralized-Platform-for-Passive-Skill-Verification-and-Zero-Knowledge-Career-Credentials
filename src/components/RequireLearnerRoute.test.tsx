import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { RequireLearnerRoute } from "./RequireLearnerRoute";
import { verifyLearnerAccess } from "@/lib/learner-auth";
import { getSsiIdentityApi } from "@/services/api/ssi.api";

vi.mock("@/hooks/useAuth", () => {
  const user = { id: "test-learner", email_confirmed_at: "2026-11-20T00:00:00Z" };
  return { useAuth: () => ({ user, loading: false, rolesReady: true }) };
});

vi.mock("@/lib/auth-helpers", () => ({
  isDeniedAccess: (result: { ok: boolean }) => !result.ok,
}));

vi.mock("@/lib/learner-auth", () => ({
  verifyLearnerAccess: vi.fn(async () => ({ ok: true, profileComplete: false })),
}));

vi.mock("@/services/api/ssi.api", () => ({
  getSsiIdentityApi: vi.fn(async () => ({ did: null, tableReady: true })),
}));

describe("learner profile onboarding", () => {
  it("opens Complete Profile before checking for a secure identity", async () => {
    render(
      <MemoryRouter initialEntries={["/learner/complete-profile"]}>
        <Routes>
          <Route path="/learner/complete-profile" element={
            <RequireLearnerRoute requireCompleteProfile={false} requireSsiIdentity={false}>
              <h1>Complete Profile</h1>
            </RequireLearnerRoute>
          } />
          <Route path="/learner/secure-identity" element={<h1>Secure Identity</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Complete Profile" })).toBeInTheDocument();
    expect(getSsiIdentityApi).not.toHaveBeenCalled();
  });

  it.each([false, true])("routes a returning learner with completion=%s", async (profileComplete) => {
    vi.mocked(verifyLearnerAccess).mockResolvedValueOnce({ ok: true, profileComplete });
    render(
      <MemoryRouter initialEntries={["/learner/profile"]}>
        <Routes>
          <Route path="/learner/profile" element={
            <RequireLearnerRoute requireSsiIdentity={false}><h1>Learner dashboard</h1></RequireLearnerRoute>
          } />
          <Route path="/learner/complete-profile" element={<h1>Complete Profile</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", {
      name: profileComplete ? "Learner dashboard" : "Complete Profile",
    })).toBeInTheDocument();
  });
});
