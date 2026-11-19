import { describe, expect, it } from "vitest";
import { isDeliverableContributorEmail } from "./contributor-email";
import { zonedDateTimeToIso } from "./interview";

describe("contributor emails", () => {
  it("treats GitHub noreply addresses as unavailable", () => {
    expect(isDeliverableContributorEmail("123+ada@users.noreply.github.com")).toBe(false);
    expect(isDeliverableContributorEmail("ada@example.com")).toBe(true);
  });
});

describe("interview timezone conversion", () => {
  it("keeps a UTC wall clock as the same instant", () => {
    expect(zonedDateTimeToIso("2026-10-15T09:00", "UTC")).toBe("2026-10-15T09:00:00.000Z");
  });

  it("converts a Karachi wall clock to UTC", () => {
    expect(zonedDateTimeToIso("2026-10-15T14:00", "Asia/Karachi")).toBe("2026-10-15T09:00:00.000Z");
  });
});
