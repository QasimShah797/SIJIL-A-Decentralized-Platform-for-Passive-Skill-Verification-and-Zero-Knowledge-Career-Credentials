import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/input-otp", () => ({
  InputOTP: ({
    value,
    onChange,
    maxLength,
    id,
    "aria-label": ariaLabel,
  }: {
    value: string;
    onChange: (value: string) => void;
    maxLength: number;
    id?: string;
    "aria-label"?: string;
    children?: React.ReactNode;
  }) => (
    <input
      id={id}
      data-testid="otp-input"
      aria-label={ariaLabel}
      value={value}
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
  InputOTPGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  InputOTPSlot: () => null,
}));

const verifySignupEmailOtp = vi.fn();
const resendSignupEmailOtp = vi.fn();
const completeLearnerSignupAfterEmailVerification = vi.fn();
const verifyLearnerAccess = vi.fn();
const refreshRoles = vi.fn();
const toast = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, refreshRoles }),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: (...args: unknown[]) => toast(...args) }));

vi.mock("@/lib/email-verification", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email-verification")>("@/lib/email-verification");
  return {
    ...actual,
    verifySignupEmailOtp: (...args: unknown[]) => verifySignupEmailOtp(...args),
    resendSignupEmailOtp: (...args: unknown[]) => resendSignupEmailOtp(...args),
  };
});

vi.mock("@/lib/learner-signup", () => ({
  completeLearnerSignupAfterEmailVerification: (...args: unknown[]) =>
    completeLearnerSignupAfterEmailVerification(...args),
}));

vi.mock("@/lib/learner-auth", () => ({
  verifyLearnerAccess: (...args: unknown[]) => verifyLearnerAccess(...args),
}));

vi.mock("@/components/auth/AuthEntryLayout", () => ({
  AuthEntryLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { LearnerVerifyEmailForm } from "@/components/auth/LearnerVerifyEmailForm";

describe("LearnerVerifyEmailForm", () => {
  beforeEach(() => {
    verifySignupEmailOtp.mockReset();
    resendSignupEmailOtp.mockReset();
    completeLearnerSignupAfterEmailVerification.mockReset();
    verifyLearnerAccess.mockReset();
    refreshRoles.mockReset();
    toast.mockReset();
    sessionStorage.clear();
  });

  it("verifies a valid OTP and continues onboarding", async () => {
    verifySignupEmailOtp.mockResolvedValue({
      id: "user-1",
      email: "learner@example.com",
      email_confirmed_at: "2026-11-19T00:00:00Z",
    });
    completeLearnerSignupAfterEmailVerification.mockResolvedValue(undefined);
    refreshRoles.mockResolvedValue(undefined);
    verifyLearnerAccess.mockResolvedValue({ ok: true, profileComplete: false });

    render(
      <MemoryRouter initialEntries={[{ pathname: "/signup/learner/verify-email", state: { email: "learner@example.com" } }]}>
        <Routes>
          <Route path="/signup/learner/verify-email" element={<LearnerVerifyEmailForm initialEmail="learner@example.com" />} />
          <Route path="/learner/complete-profile" element={<div>Complete profile</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByTestId("otp-input"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verify email/i }));

    await waitFor(() => {
      expect(verifySignupEmailOtp).toHaveBeenCalledWith("learner@example.com", "123456");
      expect(screen.getByText("Complete profile")).toBeInTheDocument();
    });
  });

  it("shows a friendly error for an invalid OTP", async () => {
    verifySignupEmailOtp.mockRejectedValue(
      Object.assign(new Error("That code is incorrect. Check the email and try again."), { kind: "invalid" }),
    );

    render(
      <MemoryRouter>
        <LearnerVerifyEmailForm initialEmail="learner@example.com" />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByTestId("otp-input"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /verify email/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/incorrect/i);
    });
    expect(completeLearnerSignupAfterEmailVerification).not.toHaveBeenCalled();
  });

  it("enforces resend cooldown messaging after a send", async () => {
    resendSignupEmailOtp.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <LearnerVerifyEmailForm initialEmail="learner@example.com" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /resend code/i }));

    await waitFor(() => {
      expect(resendSignupEmailOtp).toHaveBeenCalledWith("learner@example.com");
      expect(screen.getByRole("button", { name: /resend code in/i })).toBeDisabled();
    });
  });
});
