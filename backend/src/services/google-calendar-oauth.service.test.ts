import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GOOGLE_CALENDAR_EVENTS_SCOPE,
  buildGoogleCalendarAuthorizeUrl,
  type GoogleCalendarOAuthConfig,
} from "../config/google-calendar";
import { assertStateShape, buildFrontendRedirect } from "./google-calendar-oauth.service";
import { decryptSecret, encryptSecret } from "../utils/token-crypto";
import { requireAdmin, requireRecruiter } from "../middleware/role.middleware";
import { ROLES } from "../constants/roles";
import type { Request, Response } from "express";
import { AppError } from "../utils/AppError";

const config: GoogleCalendarOAuthConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://localhost:5000/api/integrations/google-calendar/callback",
  encryptionKey: "sijil-local-test-encryption-key-32chars!!",
};

describe("google calendar oauth phase 1 helpers", () => {
  it("builds authorize URLs with offline access and consent, without leaking the client secret", () => {
    const url = buildGoogleCalendarAuthorizeUrl("csrf-state-value-123456", config);
    assert.match(url, /accounts\.google\.com\/o\/oauth2\/v2\/auth/);
    assert.match(url, /access_type=offline/);
    assert.match(url, /prompt=consent/);
    assert.match(url, new RegExp(encodeURIComponent(GOOGLE_CALENDAR_EVENTS_SCOPE)));
    assert.match(url, /state=csrf-state-value-123456/);
    assert.equal(url.includes("client-secret"), false);
  });

  it("validates OAuth state shape used for CSRF", () => {
    assert.equal(assertStateShape("short"), false);
    assert.equal(assertStateShape("goodstatevalueabcdef"), true);
    assert.equal(assertStateShape("bad state with spaces!!!"), false);
  });

  it("encrypts connection tokens so status payloads never need plaintext secrets", () => {
    const refresh = encryptSecret("1//refresh-token-value", config.encryptionKey);
    const access = encryptSecret("ya29.access-token-value", config.encryptionKey);
    const statusPayload = {
      connected: true,
      googleEmail: "admin@example.com",
      tokenStatus: "active",
    };
    assert.equal(JSON.stringify(statusPayload).includes("1//"), false);
    assert.equal(JSON.stringify(statusPayload).includes("ya29"), false);
    assert.equal(decryptSecret(refresh, config.encryptionKey), "1//refresh-token-value");
    assert.equal(decryptSecret(access, config.encryptionKey), "ya29.access-token-value");
  });

  it("builds frontend redirects without embedding tokens", () => {
    const url = buildFrontendRedirect("error", "Google Calendar OAuth state expired");
    assert.match(url, /googleCalendar=error/);
    assert.equal(url.includes("ya29"), false);
    assert.equal(url.includes("refresh_token"), false);
  });

  it("requires admin role and rejects recruiters for Calendar admin routes", () => {
    const recruiterReq = {
      user: { id: "r1" },
      userRoles: [ROLES.RECRUITER],
    } as unknown as Request;
    assert.throws(
      () => requireAdmin(recruiterReq, {} as Response, () => undefined),
      (err: unknown) => err instanceof AppError && /insufficient permissions/i.test(err.message),
    );

    const adminReq = {
      user: { id: "a1" },
      userRoles: [ROLES.ADMIN],
    } as unknown as Request;
    let adminCalled = false;
    requireAdmin(adminReq, {} as Response, () => {
      adminCalled = true;
    });
    assert.equal(adminCalled, true);

    // Recruiter middleware still works independently — interview scheduling unchanged.
    let recruiterOk = false;
    requireRecruiter(recruiterReq, {} as Response, () => {
      recruiterOk = true;
    });
    assert.equal(recruiterOk, true);
  });
});
