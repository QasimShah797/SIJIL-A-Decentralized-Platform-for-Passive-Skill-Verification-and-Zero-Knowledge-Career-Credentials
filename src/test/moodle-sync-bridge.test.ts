import { describe, expect, it } from "vitest";
import {
  moodleSyncBridgeMisconfiguredMessage,
  moodleSyncBridgeUnreachableMessage,
  parseMoodleSyncBridgeUrl,
  resolveMoodleSyncBridgeConfig,
} from "@/lib/moodle-sync-bridge";

describe("parseMoodleSyncBridgeUrl", () => {
  it("accepts loopback http bridge URLs", () => {
    expect(parseMoodleSyncBridgeUrl("http://127.0.0.1:8787")).toEqual({
      ok: true,
      url: "http://127.0.0.1:8787",
    });
    expect(parseMoodleSyncBridgeUrl("http://localhost:8787/")).toEqual({
      ok: true,
      url: "http://localhost:8787",
    });
  });

  it("rejects empty, remote, and non-http URLs", () => {
    expect(parseMoodleSyncBridgeUrl("").ok).toBe(false);
    expect(parseMoodleSyncBridgeUrl("https://nhzvtqpplfruzocframc.supabase.co/functions/v1/moodle-sync").ok).toBe(
      false,
    );
    expect(parseMoodleSyncBridgeUrl("ftp://127.0.0.1:8787").ok).toBe(false);
    expect(parseMoodleSyncBridgeUrl("http://evil.example:8787").ok).toBe(false);
  });
});

describe("resolveMoodleSyncBridgeConfig", () => {
  it("disables bridge when unset", () => {
    expect(resolveMoodleSyncBridgeConfig(undefined)).toEqual({
      enabled: false,
      url: null,
      error: null,
    });
  });

  it("enables bridge for valid loopback URL", () => {
    expect(resolveMoodleSyncBridgeConfig("http://127.0.0.1:8787")).toEqual({
      enabled: true,
      url: "http://127.0.0.1:8787",
      error: null,
    });
  });

  it("surfaces misconfiguration without enabling", () => {
    const cfg = resolveMoodleSyncBridgeConfig("https://example.com/moodle-sync");
    expect(cfg.enabled).toBe(false);
    expect(cfg.url).toBeNull();
    expect(cfg.error).toMatch(/localhost/i);
    expect(moodleSyncBridgeMisconfiguredMessage(cfg.error!)).toMatch(/misconfigured/i);
  });
});

describe("bridge error messages", () => {
  it("explains unreachable local bridge without claiming hosted Moodle works", () => {
    const msg = moodleSyncBridgeUnreachableMessage("http://127.0.0.1:8787");
    expect(msg).toMatch(/moodle:serve-bridge/);
    expect(msg.toLowerCase()).toMatch(/hosted edge cannot reach localhost/);
  });
});
