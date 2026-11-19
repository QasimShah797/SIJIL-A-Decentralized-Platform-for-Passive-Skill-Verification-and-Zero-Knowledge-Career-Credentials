import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  inviteSendDecision,
  safeSmtpFailure,
  smtpResponseCode,
  storedDeliveryStatus,
  withTimeout,
} from "./invite-email-delivery";

describe("invite email delivery", () => {
  it("treats a missing delivery value as unknown", () => {
    assert.equal(storedDeliveryStatus(null), "unknown");
    assert.equal(storedDeliveryStatus("sent"), "sent");
  });

  it("does not send again when the same invitation is clicked twice", () => {
    assert.equal(inviteSendDecision({
      existing: true,
      resend: false,
      delivery: "unknown",
    }), "return_existing");
    assert.equal(inviteSendDecision({
      existing: true,
      resend: false,
      delivery: "sent",
    }), "return_existing");
  });

  it("does not send a second message while delivery is pending", () => {
    assert.equal(inviteSendDecision({
      existing: true,
      resend: true,
      delivery: "pending",
    }), "return_existing");
  });

  it("allows one explicit retry after a failed or unconfirmed send", () => {
    assert.equal(inviteSendDecision({
      existing: true,
      resend: true,
      delivery: "failed",
    }), "resend");
    assert.equal(inviteSendDecision({
      existing: true,
      resend: true,
      delivery: "unknown",
    }), "resend");
  });

  it("creates and sends only when no open invitation exists", () => {
    assert.equal(inviteSendDecision({
      existing: false,
      resend: false,
      delivery: "unknown",
    }), "create_and_send");
  });

  it("rejects a hung SMTP attempt without keeping the secret text", async () => {
    await assert.rejects(
      withTimeout(new Promise(() => undefined), 20),
      /smtp_timeout/,
    );
    assert.equal(safeSmtpFailure(new Error("smtp_timeout")), "smtp_timeout");
    assert.equal(safeSmtpFailure(new Error("535-5.7.8 Username and Password not accepted")), "smtp_auth_rejected");
    assert.equal(/password/i.test(safeSmtpFailure(new Error("535 Username and Password not accepted"))), false);
    assert.equal(smtpResponseCode("250 2.0.0 OK"), "250");
  });

  it("returns a successful send before the timeout", async () => {
    assert.equal(await withTimeout(Promise.resolve("sent"), 50), "sent");
  });
});
