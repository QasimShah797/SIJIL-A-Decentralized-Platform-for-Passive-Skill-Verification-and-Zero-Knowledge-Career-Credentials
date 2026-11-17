import { describe, expect, it } from "vitest";
import {
  moodleSyncBridgeMisconfiguredMessage,
  moodleSyncBridgeUnreachableMessage,
  parseMoodleSyncBridgeUrl,
  resolveMoodleSyncBridgeConfig,
  resolveMoodleSyncRoute,
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

describe("resolveMoodleSyncRoute", () => {
  it("uses the hosted function for the public Moodle site even if a bridge URL is set", () => {
    expect(resolveMoodleSyncRoute(
      "http://127.0.0.1:8787",
      "https://sijil-lms.duckdns.org",
    )).toEqual({ enabled: false, url: null, error: null });
  });

  it("uses the local bridge only when Moodle itself is local", () => {
    expect(resolveMoodleSyncRoute(
      "http://127.0.0.1:8787",
      "http://localhost:8000",
    )).toEqual({
      enabled: true,
      url: "http://127.0.0.1:8787",
      error: null,
    });
  });
});

describe("bridge error messages", () => {
  it("explains that the local bridge is not the public Moodle path", () => {
    const msg = moodleSyncBridgeUnreachableMessage("http://127.0.0.1:8787");
    expect(msg).toMatch(/VITE_MOODLE_SYNC_BRIDGE_URL/);
    expect(msg.toLowerCase()).toMatch(/hosted moodle-sync function/);
  });
});
