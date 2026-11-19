import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractMeetUrlFromEventPayload } from "./google-calendar-events.service";

describe("google-calendar-events Meet extraction", () => {
  it("prefers hangoutLink", () => {
    const url = extractMeetUrlFromEventPayload({
      hangoutLink: "https://meet.google.com/abc-defg-hij",
      conferenceData: {
        entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/other" }],
      },
    });
    assert.equal(url, "https://meet.google.com/abc-defg-hij");
  });

  it("falls back to conference video entryPoint", () => {
    const url = extractMeetUrlFromEventPayload({
      conferenceData: {
        entryPoints: [
          { entryPointType: "phone", uri: "tel:+1" },
          { entryPointType: "video", uri: "https://meet.google.com/zzz-yyyy-xxx" },
        ],
      },
    });
    assert.equal(url, "https://meet.google.com/zzz-yyyy-xxx");
  });

  it("returns null when Meet is missing", () => {
    assert.equal(extractMeetUrlFromEventPayload({ id: "evt-1" }), null);
  });
});
