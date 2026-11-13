import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const single = vi.fn();
const updateEq = vi.fn();
const updateSelect = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle,
          single,
        })),
      })),
      update: vi.fn(() => ({
        eq: (...args: unknown[]) => {
          updateEq(...args);
          return {
            select: (...selectArgs: unknown[]) => {
              updateSelect(...selectArgs);
              return { single };
            },
          };
        },
      })),
      insert: vi.fn(),
      upsert: vi.fn(),
    })),
  },
}));

vi.mock("@/lib/profile-oauth-verification", () => ({
  meetsOAuthCompletionRequirements: vi.fn(async () => ({ ok: false, github: false })),
}));

vi.mock("@/lib/profile-ui-fields", () => ({
  loadProfileUiFields: vi.fn(() => ({})),
  saveProfileUiFields: vi.fn(),
}));

import {
  isLearnerProfileComplete,
  saveSelfSignupOnboarding,
  selfSignupProfileProgress,
  type SelfSignupProfileForm,
} from "@/lib/db/learner-profile";
import { meetsOAuthCompletionRequirements } from "@/lib/profile-oauth-verification";

const USER_ID = "15e1ecb4-8150-4b0f-bb55-c4e469ba855f";

function baseSelfSignupRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: USER_ID,
    first_name: "Syed",
    last_name: "Qasim Ali Shah",
    contact_number: null,
    institution_name: null,
    institution_id: null,
    university_email: "learner@example.com",
    program: null,
    department: null,
    student_id: null,
    github_url: null,
    linkedin_url: null,
    portfolio_url: null,
    bio: null,
    career_goal: null,
    skills_summary: null,
    avatar_url: null,
    batch: null,
    holder_did: null,
    profile_completed: false,
    account_activated_at: null,
    city_country: null,
    status: "email_pending",
    username: null,
    created_at: "2026-11-09T00:00:00.000Z",
    updated_at: "2026-11-09T00:00:00.000Z",
    ...overrides,
  };
}

const completeForm: SelfSignupProfileForm = {
  contactNumber: "+92 300 0000000",
  dateOfBirth: "",
  gender: "",
  country: "Pakistan",
  city: "Lahore",
  institutionName: "",
  program: "",
  graduationYear: "",
  bio: "Learner bio",
  skillsSummary: "Java",
  careerGoal: "Software engineer",
  linkedinUrl: "",
};

describe("learner profile completion without mandatory GitHub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(meetsOAuthCompletionRequirements).mockResolvedValue({ ok: false, github: false });
  });

  it("marks profile complete when required fields are present and GitHub is absent", async () => {
    maybeSingle.mockResolvedValue({
      data: baseSelfSignupRow({
        contact_number: "+92 300 0000000",
        city_country: "Lahore, Pakistan",
        bio: "Learner bio",
        skills_summary: "Java",
        career_goal: "Software engineer",
      }),
      error: null,
    });

    await expect(isLearnerProfileComplete(USER_ID)).resolves.toBe(true);
    expect(meetsOAuthCompletionRequirements).not.toHaveBeenCalled();
  });

  it("keeps profile incomplete when required personal fields are missing", async () => {
    maybeSingle.mockResolvedValue({
      data: baseSelfSignupRow({
        contact_number: null,
        city_country: null,
        bio: null,
        skills_summary: null,
        career_goal: null,
      }),
      error: null,
    });

    await expect(isLearnerProfileComplete(USER_ID)).resolves.toBe(false);
  });

  it("still marks complete when required fields and verified GitHub are both present", async () => {
    vi.mocked(meetsOAuthCompletionRequirements).mockResolvedValue({ ok: true, github: true });
    maybeSingle.mockResolvedValue({
      data: baseSelfSignupRow({
        contact_number: "+92 300 0000000",
        city_country: "Lahore, Pakistan",
        bio: "Learner bio",
        skills_summary: "Java",
        career_goal: "Software engineer",
        github_url: "https://github.com/example",
      }),
      error: null,
    });

    await expect(isLearnerProfileComplete(USER_ID)).resolves.toBe(true);
  });

  it("reaches 100% progress from personal fields alone (GitHub optional)", () => {
    expect(selfSignupProfileProgress(completeForm, { githubVerified: false })).toBe(100);
    expect(selfSignupProfileProgress(completeForm, { githubVerified: true })).toBe(100);
    expect(
      selfSignupProfileProgress({ ...completeForm, bio: "" }, { githubVerified: true }),
    ).toBeLessThan(100);
  });

  it("saves self-signup onboarding without requiring GitHub", async () => {
    maybeSingle.mockResolvedValue({
      data: baseSelfSignupRow(),
      error: null,
    });
    single.mockResolvedValue({
      data: baseSelfSignupRow({
        contact_number: completeForm.contactNumber,
        city_country: "Lahore, Pakistan",
        bio: completeForm.bio,
        skills_summary: completeForm.skillsSummary,
        career_goal: completeForm.careerGoal,
        profile_completed: true,
      }),
      error: null,
    });

    const updated = await saveSelfSignupOnboarding(USER_ID, {
      contactNumber: completeForm.contactNumber,
      country: completeForm.country,
      city: completeForm.city,
      bio: completeForm.bio,
      skillsSummary: completeForm.skillsSummary,
      careerGoal: completeForm.careerGoal,
    });

    expect(updated.profile_completed).toBe(true);
    expect(meetsOAuthCompletionRequirements).not.toHaveBeenCalled();
    expect(updateEq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("rejects self-signup onboarding when required personal fields are incomplete", async () => {
    maybeSingle.mockResolvedValue({
      data: baseSelfSignupRow(),
      error: null,
    });

    await expect(
      saveSelfSignupOnboarding(USER_ID, {
        contactNumber: "",
        country: "",
        city: "",
        bio: "",
        skillsSummary: "",
        careerGoal: "",
      }),
    ).rejects.toThrow(/required profile fields/i);
  });
});
