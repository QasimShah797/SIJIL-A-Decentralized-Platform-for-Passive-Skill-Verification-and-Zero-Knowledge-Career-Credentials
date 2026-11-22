import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { RequireLearnerRoute } from "./RequireLearnerRoute";
import { getSsiIdentityApi } from "@/services/api/ssi.api";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "test-learner" }, loading: false, rolesReady: true }),
}));

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
});
