import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../utils/AppError";
import { clientErrorMessage } from "../middleware/error.middleware";
import {
  finishInvitationDelivery,
  interviewSaveFailure,
  scheduleResultMessage,
} from "./interview-delivery";

describe("interview invitation delivery", () => {
  it("records a sent invitation only when the provider accepts it", async () => {
    const marked: string[] = [];
    const status = await finishInvitationDelivery({
      send: async () => ({ delivered: true }),
      mark: async (next) => {
        marked.push(next);
      },
    });
    assert.equal(status, "sent");
    assert.deepEqual(marked, ["sent"]);
    assert.equal(scheduleResultMessage(status), "Interview scheduled and invitation emailed");
  });

  it("keeps the saved interview when the provider rejects the message", async () => {
    const marked: string[] = [];
    const status = await finishInvitationDelivery({
      send: async () => {
        throw new Error("Failed to send email: Invalid login: 535-5.7.8 Username and Password not accepted.");
      },
      mark: async (next) => {
        marked.push(next);
      },
    });
    assert.equal(status, "failed");
    assert.deepEqual(marked, ["failed"]);
    const message = scheduleResultMessage(status);
    assert.match(message, /Interview scheduled, but the email provider did not accept/);
    assert.equal(/password/i.test(message), false);
    const hidden = clientErrorMessage(new AppError(
      "Interview was saved, but the invitation email could not be sent: Username and Password not accepted",
      502,
    ));
    assert.equal(hidden, "Internal server error");
  });

  it("reports a database failure without claiming the interview was saved", () => {
    const error = interviewSaveFailure();
    assert.equal(error.statusCode, 500);
    assert.equal(error.message, "Could not save the interview");
    assert.equal(clientErrorMessage(error), "Could not save the interview");
  });

  it("does not call the invitation sent when SMTP is not configured", async () => {
    const status = await finishInvitationDelivery({
      send: async () => ({ delivered: false }),
      mark: async () => undefined,
    });
    assert.equal(status, "not_sent");
    assert.match(scheduleResultMessage(status), /SMTP_USER and SMTP_PASS/);
  });
});
