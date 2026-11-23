import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveSelfSignupOnboarding, saveSelfSignupProfileProgress } from "./learner-profile";
import { verifyLearnerAccess } from "@/lib/learner-auth";

const db = vi.hoisted(() => ({
  read: vi.fn(),
  update: vi.fn(),
  restrictUpdate: vi.fn(),
  completed: vi.fn(),
  github: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: db.read }) }),
      update: db.update,
    }),
  },
}));
vi.mock("@/lib/auth-helpers", () => ({ fetchUserRoles: vi.fn(async () => ["learner"]) }));
vi.mock("@/lib/profile-oauth-verification", () => ({ meetsOAuthCompletionRequirements: db.github }));

const profile = {
  contactNumber: "+92 300 1234567",
  city: "Gulmit",
  country: "Pakistan",
  gender: "female",
  institutionName: "Test University",
  program: "Computer Science",
  graduationYear: 2028,
  bio: "",
  skillsSummary: "",
  careerGoal: "",
};

describe("persisted learner onboarding", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.read.mockResolvedValue({ data: { profile_completed: false }, error: null });
    db.github.mockResolvedValue({ github: true });
    db.update.mockReturnValue({ eq: () => ({ eq: db.restrictUpdate }) });
    db.restrictUpdate.mockReturnValue({ error: null, select: () => ({ maybeSingle: db.completed }) });
  });

  it("keeps the completion flag untouched during draft autosave", async () => {
    await saveSelfSignupProfileProgress("learner", { ...profile, city: "" });

    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ city_country: null }));
    expect(db.update.mock.calls[0][0]).not.toHaveProperty("profile_completed");
    expect(db.restrictUpdate).toHaveBeenCalledWith("profile_completed", false);
    expect(db.github).not.toHaveBeenCalled();
  });

  it("writes required data and completion together only on valid submission", async () => {
    await expect(saveSelfSignupOnboarding("learner", { ...profile, city: "" })).rejects.toThrow(/city/);
    await expect(saveSelfSignupOnboarding("learner", { ...profile, gender: "unsupported" })).rejects.toThrow(/Male or Female/);
    db.github.mockResolvedValueOnce({ github: false });
    await expect(saveSelfSignupOnboarding("learner", profile)).rejects.toThrow(/GitHub/);
    expect(db.update).not.toHaveBeenCalled();

    db.completed.mockResolvedValue({ data: { profile_completed: true }, error: null });
    await expect(saveSelfSignupOnboarding("learner", profile)).resolves.toMatchObject({ profile_completed: true });
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({
      city_country: "Gulmit, Pakistan", gender: "female", graduation_year: 2028, profile_completed: true,
    }));
  });

  it.each([false, true])("uses database completion=%s for returning learners", async (profileCompleted) => {
    db.read.mockResolvedValue({ data: { profile_completed: profileCompleted }, error: null });

    await expect(verifyLearnerAccess("learner")).resolves.toEqual({ ok: true, profileComplete: profileCompleted });
    expect(db.github).not.toHaveBeenCalled();
  });
});
