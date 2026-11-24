import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleInterviewDialog } from "./ScheduleInterviewDialog";
import { scheduleInterviewApi } from "@/services/api/interview.api";
import { toast } from "@/hooks/use-toast";
import type { ScheduledInterviewView } from "@/lib/interview";

vi.mock("@/services/api/interview.api", () => ({
  scheduleInterviewApi: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

function saved(emailStatus: string): ScheduledInterviewView {
  return {
    id: "interview-1",
    recruiterUserId: "recruiter-1",
    candidateUserId: "learner-1",
    candidateName: "Horain",
    candidateEmail: "learner@example.com",
    recruiterName: "Recruiter",
    recruiterCompany: null,
    scheduledAt: "2026-12-01T10:00:00.000Z",
    durationMinutes: 30,
    mode: "video_call",
    locationOrLink: "https://meet.example.com/sijil",
    notes: null,
    timeZone: "Asia/Karachi",
    status: "scheduled",
    cancelledAt: null,
    emailStatus,
    createdAt: "2026-11-15T16:00:00.000Z",
  };
}

function submit() {
  fireEvent.click(screen.getByRole("radio", { name: "Enter my own meeting link" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Meeting URL" }), {
    target: { value: "https://meet.example.com/sijil" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
}

describe("schedule interview dialog", () => {
  beforeEach(() => {
    vi.mocked(scheduleInterviewApi).mockReset();
    vi.mocked(toast).mockReset();
  });

  it("says the invitation was sent only after the provider accepts it", async () => {
    vi.mocked(scheduleInterviewApi).mockResolvedValue(saved("sent"));
    render(
      <ScheduleInterviewDialog open onOpenChange={() => undefined} candidateId="learner-1" candidateName="Horain" />,
    );
    submit();
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        title: "Interview scheduled and invitation sent",
      }));
    });
    expect(JSON.stringify(vi.mocked(toast).mock.calls)).not.toContain("learner@example.com");
    const payload = vi.mocked(scheduleInterviewApi).mock.calls[0][0];
    expect(payload.timeZone).toBeTruthy();
    expect(payload).not.toHaveProperty("candidateEmail");
    expect(payload.candidateId).toBe("learner-1");
    expect(payload.locationOrLink).toBe("https://meet.example.com/sijil");
  });

  it("defaults to generating a Meet link and omits a manual override", async () => {
    vi.mocked(scheduleInterviewApi).mockResolvedValue(saved("sent"));
    render(
      <ScheduleInterviewDialog open onOpenChange={() => undefined} candidateId="learner-1" candidateName="Horain" />,
    );
    expect(screen.getByRole("radio", { name: "Generate Google Meet link (recommended)" })).toBeChecked();
    expect(screen.queryByRole("textbox", { name: "Meeting URL" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(scheduleInterviewApi).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "video_call", locationOrLink: undefined }),
    ));
  });

  it("offers a manual retry with the same interview details when automatic Meet is unavailable", async () => {
    vi.mocked(scheduleInterviewApi)
      .mockRejectedValueOnce(new Error("API 503: Automatic Google Meet is unavailable. Enter your own meeting link."))
      .mockResolvedValueOnce(saved("sent"));
    const onOpenChange = vi.fn();
    render(<ScheduleInterviewDialog open onOpenChange={onOpenChange} candidateId="learner-1" candidateName="Horain" />);
    fireEvent.change(screen.getByLabelText("Notes (optional)"), { target: { value: "Bring portfolio" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Automatic Google Meet is unavailable");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: "Enter my own meeting link" })).toBeChecked();
    fireEvent.change(screen.getByRole("textbox", { name: "Meeting URL" }), { target: { value: "https://meet.example.com/sijil" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(scheduleInterviewApi).toHaveBeenNthCalledWith(2, {
      ...vi.mocked(scheduleInterviewApi).mock.calls[0][0],
      notes: "Bring portfolio",
      locationOrLink: "https://meet.example.com/sijil",
    });
  });

  it("keeps a saved interview separate from an email rejection", async () => {
    vi.mocked(scheduleInterviewApi).mockResolvedValue(saved("failed"));
    render(
      <ScheduleInterviewDialog open onOpenChange={() => undefined} candidateId="learner-1" candidateName="Horain" />,
    );
    submit();
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        title: "Interview scheduled, but the email was not sent",
      }));
    });
    expect(screen.queryByText("Interview scheduling failed")).toBeNull();
  });

  it("says scheduling failed when the interview is not saved", async () => {
    vi.mocked(scheduleInterviewApi).mockRejectedValue(new Error("API 500: Could not save the interview"));
    render(
      <ScheduleInterviewDialog open onOpenChange={() => undefined} candidateId="learner-1" candidateName="Horain" />,
    );
    submit();
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        title: "Interview scheduling failed",
        description: "API 500: Could not save the interview",
      }));
    });
  });
});
