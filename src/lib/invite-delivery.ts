import type { ContributorReviewStatus } from "@/lib/sijil-data";

export type StoredEmailDelivery = "pending" | "sent" | "failed" | "not_sent" | "unknown";

export function contributorStatusForDelivery(
  delivery: StoredEmailDelivery,
): ContributorReviewStatus {
  if (delivery === "sent") return "Invite Sent";
  if (delivery === "failed") return "Email failed";
  if (delivery === "not_sent") return "Email not sent";
  if (delivery === "pending") return "Email pending";
  return "Delivery not confirmed";
}

export function isInvitationRow(status: ContributorReviewStatus): boolean {
  return status === "Invite Sent"
    || status === "Email failed"
    || status === "Email not sent"
    || status === "Email pending"
    || status === "Delivery not confirmed";
}

export function deliveryToast(params: {
  requestStatus: string;
  delivery?: string | null;
  resend?: boolean;
  skillName?: string;
  projectName?: string;
}): { title: string; description: string; variant?: "destructive" } {
  const delivery = params.delivery ?? "";
  const where = params.skillName && params.projectName
    ? ` for ${params.skillName} on ${params.projectName}`
    : "";

  if (params.requestStatus === "resend_blocked") {
    return {
      title: "Resend blocked",
      description: "The saved address is not the current public GitHub profile email. The invitation was not changed or emailed.",
      variant: "destructive",
    };
  }

  if (params.requestStatus === "already_invited") {
    if (delivery === "sent") {
      return {
        title: "Invitation already emailed",
        description: "This contributor already has a pending invitation. It was not emailed again.",
      };
    }
    if (delivery === "pending") {
      return {
        title: "Email still sending",
        description: "An invitation is already being sent. Refresh the page instead of clicking again.",
      };
    }
    if (delivery === "failed" || delivery === "not_sent") {
      return {
        title: "Invitation already saved",
        description: "The earlier email was not accepted. Use Resend to try once. This click did not send another message.",
      };
    }
    return {
      title: "Invitation already saved",
      description: "An invitation is already pending. Email delivery was not confirmed, so it was not sent again.",
    };
  }

  if (params.requestStatus === "review_exists") {
    return {
      title: "Review already exists",
      description: "This contributor has already submitted a review for this project.",
    };
  }

  if (delivery === "sent" || params.requestStatus === "resent") {
    return {
      title: params.resend || params.requestStatus === "resent" ? "Invitation resent" : "Feedback request emailed",
      description: `Gmail accepted the message${where}.`,
    };
  }
  if (delivery === "failed") {
    return {
      title: "Invitation saved, email not accepted",
      description: "Gmail did not accept the message. The invitation was kept. You can resend it.",
      variant: "destructive",
    };
  }
  if (delivery === "not_sent" || params.requestStatus === "email_not_sent") {
    return {
      title: "Invitation saved, email not sent",
      description: "The invitation is saved, but SMTP did not send it. You can resend after mail is configured.",
      variant: "destructive",
    };
  }
  if (delivery === "pending") {
    return {
      title: "Invitation saved",
      description: "Email delivery is still pending. Refresh before trying again.",
    };
  }
  return {
    title: "Invitation saved",
    description: "The invitation is saved. Email delivery was not confirmed.",
  };
}
