import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SelfSignupCompleteProfile from "./SelfSignupCompleteProfile";
import { fetchLearnerProfileRow, saveSelfSignupOnboarding } from "@/lib/db/learner-profile";
import { loadProfileFormDraft } from "@/lib/profile-oauth-draft";
import { toast } from "@/hooks/use-toast";
import cities from "@/data/pakistan-cities.json";

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
    saveSelfSignupProfileProgress: vi.fn(async () => undefined),
    saveSelfSignupOnboarding: vi.fn(async () => ({})),
  };
});

function renderProfile(path = "/learner/complete-profile") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/learner/complete-profile" element={<SelfSignupCompleteProfile />} />
        <Route path="/learner/secure-identity" element={<h1>Secure Identity</h1>} />
        <Route path="/learner/profile" element={<h1>Learner dashboard</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("complete learner profile", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(["connected", "error"])("restores an incomplete draft after GitHub returns %s", async (result) => {
    const page = renderProfile();
    fireEvent.change(await screen.findByLabelText("Phone number"), { target: { value: "+92 311 0000000" } });
    fireEvent.change(screen.getByLabelText("Bio / about me"), { target: { value: "Draft bio" } });
    page.unmount();

    renderProfile("/learner/complete-profile?github=" + result);
    expect(await screen.findByLabelText("Phone number")).toHaveValue("+92 311 0000000");
    expect(screen.getByLabelText("Bio / about me")).toHaveValue("Draft bio");
    expect(screen.queryByRole("heading", { name: "Learner dashboard" })).toBeNull();
    expect(saveSelfSignupOnboarding).not.toHaveBeenCalled();
  });

  it("sends previously completed learners to the dashboard", async () => {
    vi.mocked(fetchLearnerProfileRow).mockResolvedValueOnce(
      { profile_completed: true } as Awaited<ReturnType<typeof fetchLearnerProfileRow>>,
    );
    renderProfile();
    expect(await screen.findByRole("heading", { name: "Learner dashboard" })).toBeInTheDocument();
  });
  it("requires education and completes the profile with all About You fields blank", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => cities })));
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    const { container } = renderProfile();
    expect(await screen.findByRole("heading", { name: "Complete Your Profile" })).toBeInTheDocument();
    const change = (label: string, value: string) => {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    };
    change("Phone number", "+92 300 1234567");
    expect(container.querySelector("[placeholder]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "City" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Search Pakistan cities" }), { target: { value: "Islamabad" } });
    fireEvent.click(await screen.findByRole("option", { name: /Islamabad.*Islamabad Capital Territory/ }));
    expect(loadProfileFormDraft("test-learner", "self_signup")).toMatchObject({ city: "Islamabad", country: "Pakistan" });
    fireEvent.click(screen.getByRole("button", { name: "Complete profile" }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Current institution is required" }));
    expect(saveSelfSignupOnboarding).not.toHaveBeenCalled();

    change("Current institution", "Test University");
    change("Program / degree", "BSc Computer Science");
    change("Graduation year", "2028");
    await waitFor(() => expect(screen.getByRole("progressbar")).toHaveAttribute("value", "100"));
    expect(saveSelfSignupOnboarding).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Learner dashboard" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Complete profile" }));
    expect(await screen.findByRole("heading", { name: "Secure Identity" })).toBeInTheDocument();
    expect(saveSelfSignupOnboarding).toHaveBeenCalledWith("test-learner", expect.objectContaining({
      institutionName: "Test University", program: "BSc Computer Science", graduationYear: 2028,
      city: "Islamabad", country: "Pakistan", bio: "", skillsSummary: "", careerGoal: "",
    }));
  });
});
