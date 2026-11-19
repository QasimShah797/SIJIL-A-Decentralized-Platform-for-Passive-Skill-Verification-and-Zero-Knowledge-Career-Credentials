import { describe, expect, it } from "vitest";
import {
  isCurrentMoodleSiteUrl,
  isLegacyMoodleSiteUrl,
  moodleActivityQuerySite,
} from "@/lib/moodle-integration";

describe("Moodle activity site filter", () => {
  it("loads the live DuckDNS catalog instead of the retired MoodleCloud site", () => {
    expect(moodleActivityQuerySite()).toBe("https://sijil-lms.duckdns.org");
    expect(isCurrentMoodleSiteUrl("https://sijil-lms.duckdns.org")).toBe(true);
    expect(isCurrentMoodleSiteUrl("https://sijil-lms.duckdns.org/")).toBe(true);
    expect(isCurrentMoodleSiteUrl("https://sijil-fyp.moodlecloud.com")).toBe(false);
    expect(isLegacyMoodleSiteUrl("https://sijil-fyp.moodlecloud.com")).toBe(true);
  });
});
