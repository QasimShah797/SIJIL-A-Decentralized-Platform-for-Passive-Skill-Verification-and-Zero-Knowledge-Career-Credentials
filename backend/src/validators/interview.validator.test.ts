import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scheduleInterviewSchema } from "./interview.validator";

describe("scheduleInterviewSchema Meet-ready validation", () => {
  const base = {
    candidateId: "11111111-1111-4111-8111-111111111111",
    scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
    durationMinutes: 30,
    timeZone: "Asia/Karachi",
  };

  it("allows video_call without locationOrLink (auto Meet)", () => {
    const parsed = scheduleInterviewSchema.parse({
      ...base,
      mode: "video_call",
    });
    assert.equal(parsed.mode, "video_call");
    assert.equal(parsed.locationOrLink, "");
  });

  it("requires location for in_person", () => {
    assert.throws(
      () =>
        scheduleInterviewSchema.parse({
          ...base,
          mode: "in_person",
          locationOrLink: "",
        }),
    );
  });

  it("accepts in_person with location", () => {
    const parsed = scheduleInterviewSchema.parse({
      ...base,
      mode: "in_person",
      locationOrLink: "Building A, Room 12",
    });
    assert.equal(parsed.locationOrLink, "Building A, Room 12");
  });
});
