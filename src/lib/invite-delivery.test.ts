import { describe, expect, it } from "vitest";
import { contributorStory, coverageFromRows } from "@/lib/peer-review-insights";
import { contributorStatusForDelivery, deliveryToast } from "@/lib/invite-delivery";
import type { ContributorRow } from "@/lib/db/peer-review-page";

function row(status: ContributorRow["status"]): ContributorRow {
  return {
    contributor: {
      id: "c1",
      name: "Ayesha",
      role: "Project Collaborator",
    },
    project: {
      id: "gh-1",
      name: "SCD-Lab",
      source: "GitHub",
      evidenceLabel: "GitHub",
      linkedSkills: [],
      contributors: [],
      skillLinks: [],
    },
    status,
    lastInviteAt: "2026-11-17T19:57:22.000Z",
  };
}

describe("contributor feedback delivery status", () => {
  it("does not label an unrecorded delivery as accepted", () => {
    expect(contributorStatusForDelivery("unknown")).toBe("Delivery not confirmed");
    const story = contributorStory(row("Delivery not confirmed"));
    expect(story.label).toBe("Delivery not confirmed");
    expect(story.hint).not.toMatch(/Email accepted/);
  });

  it("shows a confirmed send separately from a failure", () => {
    expect(contributorStory(row("Invite Sent")).label).toBe("Waiting");
    expect(contributorStory(row("Email failed")).label).toBe("Email not accepted");
    expect(contributorStory(row("Email pending")).action).toBe("none");
  });

  it("counts every saved invitation without treating them all as emailed", () => {
    const stats = coverageFromRows([
      row("Invite Sent"),
      row("Delivery not confirmed"),
      row("Email failed"),
    ]);
    expect(stats.invited).toBe(3);
  });

  it("tells a duplicate click that nothing new was emailed", () => {
    const toast = deliveryToast({ requestStatus: "already_invited", delivery: "unknown" });
    expect(toast.description).toMatch(/not sent again/);
    expect(deliveryToast({ requestStatus: "created", delivery: "sent", projectName: "SCD-Lab", skillName: "java" }).title)
      .toBe("Feedback request emailed");
    expect(deliveryToast({ requestStatus: "email_not_sent", delivery: "failed" }).title)
      .toBe("Invitation saved, email not accepted");
    expect(deliveryToast({ requestStatus: "resend_blocked" }).title).toBe("Resend blocked");
    expect(deliveryToast({ requestStatus: "resend_blocked" }).description).toMatch(/not changed or emailed/);
  });
});
