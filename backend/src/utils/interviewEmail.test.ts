import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, wrapSijilEmail } from "./emailHtml";
import {
  INTERVIEW_MODE,
} from "../constants/interview";
import type { InterviewEmailDetails } from "../types/interview.types";
import {
  buildInterviewCancelHtml,
  buildInterviewCancelText,
  buildInterviewInviteHtml,
  buildInterviewInviteText,
  formatDuration,
  formatInterviewWhen,
} from "./interviewEmailContent";

const details: InterviewEmailDetails = {
  candidateName: "Ayesha Khan",
  candidateEmail: "ayesha@example.com",
  recruiterName: "Omar Ali",
  recruiterCompany: "Northwind Labs",
  recruiterTitle: "Talent Lead",
  scheduledAt: new Date("2026-10-15T09:00:00.000Z"),
  durationMinutes: 45,
  mode: INTERVIEW_MODE.VIDEO_CALL,
  locationOrLink: "https://meet.example.com/sijil-interview",
  notes: "Please review your TypeScript credential beforehand.",
};

describe("SIJIL email HTML chrome", () => {
  it("escapes untrusted text", () => {
    assert.equal(escapeHtml('<a href="x">'), "&lt;a href=&quot;x&quot;&gt;");
  });

  it("wraps content in the SIJIL branded layout", () => {
    const html = wrapSijilEmail({
      documentTitle: "SIJIL Interview Invitation",
      subtitle: "Interview Invitation",
      bodyHtml: "<p>Hello</p>",
    });
    assert.match(html, /<div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">SIJIL<\/div>/);
    assert.match(html, /Interview Invitation/);
    assert.match(html, /SIJIL · Decentralized Skill Verification Platform/);
    assert.match(html, /<p>Hello<\/p>/);
  });
});

describe("interview invitation email", () => {
  it("formats date, time, and duration for the candidate", () => {
    const when = formatInterviewWhen(details.scheduledAt);
    assert.match(when.date, /15/);
    assert.match(when.date, /October 2026/);
    assert.match(when.time, /9:00/i);
    assert.match(when.time, /UTC/);
    assert.equal(formatDuration(45), "45 minutes");
    assert.equal(formatDuration(60), "1 hour");
  });

  it("includes interview details in both HTML and plain text", () => {
    const html = buildInterviewInviteHtml(details);
    const text = buildInterviewInviteText(details);

    assert.match(html, /SIJIL Interview Invitation/);
    assert.match(html, /Hello Ayesha Khan/);
    assert.match(html, /Omar Ali, Talent Lead at Northwind Labs/);
    assert.match(html, /Video call/);
    assert.match(html, /https:\/\/meet\.example\.com\/sijil-interview/);
    assert.match(html, /Please review your TypeScript credential beforehand/);
    assert.match(html, /SIJIL · Decentralized Skill Verification Platform/);

    assert.match(text, /Hello Ayesha Khan/);
    assert.match(text, /Date: .*15.*October 2026/);
    assert.match(text, /Duration: 45 minutes/);
    assert.match(text, /Meeting link: https:\/\/meet\.example\.com\/sijil-interview/);
    assert.match(text, /— SIJIL · Passive Skill Verification/);
  });

  it("escapes HTML in candidate-supplied notes", () => {
    const html = buildInterviewInviteHtml({
      ...details,
      notes: '<script>alert("xss")</script>',
    });
    assert.equal(html.includes("<script>"), false);
    assert.match(html, /&lt;script&gt;/);
  });
});

describe("interview cancellation email", () => {
  it("tells the candidate the interview was cancelled", () => {
    const html = buildInterviewCancelHtml(details);
    const text = buildInterviewCancelText(details);
    assert.match(html, /Interview Cancelled/);
    assert.match(html, /has been cancelled/);
    assert.match(text, /has been cancelled/);
    assert.match(text, /Thursday, 15 October 2026/);
  });
});
