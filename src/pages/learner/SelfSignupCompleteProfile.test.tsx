import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import SelfSignupCompleteProfile from "./SelfSignupCompleteProfile";
import { saveSelfSignupOnboarding } from "@/lib/db/learner-profile";
import { toast } from "@/hooks/use-toast";

vi.mock("@/hooks/useAuth", () => {
  const user = { id: "test-learner" };
  return { useAuth: () => ({ user, loading: false }) };
});
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/profile-oauth-verification", () => ({
  meetsOAuthCompletionRequirements: vi.fn(async () => ({ github: true, ok: true })),
}));
vi.mock("@/components/profile/VerifiedProfessionalAccounts", () => ({
  VerifiedProfessionalAccounts: () => <h2>Professional links</h2>,
}));
vi.mock("@/lib/db/learner-profile", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/learner-profile")>();
  return {
    ...original,
    fetchLearnerProfileRow: vi.fn(async () => ({})),
    isLearnerProfileComplete: vi.fn(async () => false),
    saveSelfSignupProfileProgress: vi.fn(async () => undefined),
    saveSelfSignupOnboarding: vi.fn(async () => ({})),
  };
});

describe("complete learner profile", () => {
  it("requires education and completes the profile with all About You fields blank", async () => {
    render(
      <MemoryRouter initialEntries={["/learner/complete-profile"]}>
        <Routes>
          <Route path="/learner/complete-profile" element={<SelfSignupCompleteProfile />} />
          <Route path="/learner/secure-identity" element={<h1>Secure Identity</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Complete Your Profile" })).toBeInTheDocument();
    const change = (label: string, value: string) => {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    };
    change("Phone number", "+92 300 1234567");
    change("Country", "Pakistan");
    change("City", "Islamabad");
    fireEvent.click(screen.getByRole("button", { name: "Complete profile" }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Current institution is required" }));
    expect(saveSelfSignupOnboarding).not.toHaveBeenCalled();

    change("Current institution", "Test University");
    change("Program / degree", "BSc Computer Science");
    change("Graduation year", "2028");
    await waitFor(() => expect(screen.getByRole("progressbar")).toHaveAttribute("value", "100"));
    fireEvent.click(screen.getByRole("button", { name: "Complete profile" }));
    expect(await screen.findByRole("heading", { name: "Secure Identity" })).toBeInTheDocument();
    expect(saveSelfSignupOnboarding).toHaveBeenCalledWith("test-learner", expect.objectContaining({
      institutionName: "Test University", program: "BSc Computer Science", graduationYear: 2028,
      bio: "", skillsSummary: "", careerGoal: "",
    }));
  });
});
