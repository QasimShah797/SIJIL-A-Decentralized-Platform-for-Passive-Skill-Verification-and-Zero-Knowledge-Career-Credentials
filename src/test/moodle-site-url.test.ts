import { describe, expect, it } from "vitest";
import {
  assertActualMoodleSiteMatchesExpected,
  assertMoodleUrlTransportPolicy,
  bodyAttemptsMoodleHostOverride,
  DEFAULT_MOODLE_CLOUD_SITE_URL,
  moodleSiteUrlsMatch,
  normalizeMoodleSiteUrl,
  resolveExpectedMoodleSiteUrlFromEnv,
  resolveConfiguredMoodleSiteUrl,
} from "../../supabase/functions/moodle-sync/moodle-site-url.ts";

describe("moodle site URL configuration", () => {
  it("defaults to MoodleCloud when env is absent", () => {
    expect(resolveExpectedMoodleSiteUrlFromEnv({})).toBe(
      normalizeMoodleSiteUrl(DEFAULT_MOODLE_CLOUD_SITE_URL),
    );
    expect(resolveConfiguredMoodleSiteUrl(undefined)).toBe(
      normalizeMoodleSiteUrl(DEFAULT_MOODLE_CLOUD_SITE_URL),
    );
    expect(resolveConfiguredMoodleSiteUrl("")).toBe(
      normalizeMoodleSiteUrl(DEFAULT_MOODLE_CLOUD_SITE_URL),
    );
  });

  it("accepts local Moodle expected URL over HTTP", () => {
    expect(resolveExpectedMoodleSiteUrlFromEnv({
      MOODLE_EXPECTED_SITE_URL: "http://localhost:8000",
    })).toBe("http://localhost:8000");

    expect(resolveConfiguredMoodleSiteUrl("http://127.0.0.1:8000")).toBe(
      "http://127.0.0.1:8000",
    );

    expect(
      assertMoodleUrlTransportPolicy("http://host.docker.internal:8000", "MOODLE_BASE_URL").isLocalDevHost,
    ).toBe(true);
  });

  it("normalizes trailing slashes and compares origins", () => {
    expect(normalizeMoodleSiteUrl("http://localhost:8000/")).toBe("http://localhost:8000");
    expect(normalizeMoodleSiteUrl("https://sijil-fyp.moodlecloud.com/")).toBe(
      "https://sijil-fyp.moodlecloud.com",
    );

    expect(
      moodleSiteUrlsMatch("http://localhost:8000/", "http://localhost:8000"),
    ).toBe(true);
    expect(
      moodleSiteUrlsMatch(
        "https://sijil-fyp.moodlecloud.com/",
        "https://sijil-fyp.moodlecloud.com",
      ),
    ).toBe(true);

    expect(
      assertActualMoodleSiteMatchesExpected(
        "http://localhost:8000/",
        "http://localhost:8000",
      ),
    ).toBe("http://localhost:8000");
  });

  it("rejects unexpected Moodle site identities", () => {
    expect(() =>
      assertActualMoodleSiteMatchesExpected(
        "http://localhost:8000",
        "https://sijil-fyp.moodlecloud.com",
      ),
    ).toThrow(/expected https:\/\/sijil-fyp\.moodlecloud\.com/i);

    expect(() =>
      assertActualMoodleSiteMatchesExpected(
        "https://evil.example.com",
        "https://sijil-fyp.moodlecloud.com",
      ),
    ).toThrow(/expected/i);
  });

  it("rejects untrusted remote HTTP hosts", () => {
    expect(() =>
      resolveConfiguredMoodleSiteUrl("http://moodle.example.com"),
    ).toThrow(/non-local host/i);

    expect(() =>
      assertMoodleUrlTransportPolicy("http://evil.example.com", "MOODLE_BASE_URL"),
    ).toThrow(/non-local host/i);
  });

  it("does not allow client/body Moodle host overrides", () => {
    expect(bodyAttemptsMoodleHostOverride({})).toBe(false);
    expect(bodyAttemptsMoodleHostOverride({ action: "test", force: true })).toBe(false);
    expect(bodyAttemptsMoodleHostOverride({ moodleSiteUrl: "http://evil" })).toBe(true);
    expect(bodyAttemptsMoodleHostOverride({ moodle_base_url: "http://evil" })).toBe(true);
    expect(bodyAttemptsMoodleHostOverride({ site_url: "http://evil" })).toBe(true);
  });
});
