import { describe, expect, it } from "vitest";
import { bindRequestBody } from "./ownership";
import {
  identitySetupView,
  learnerIdentityError,
  recoveryFileIsWrapped,
  recoveryPasswordIssue,
} from "./onboarding";

const serverDid = "did:key:z6Mkexample";

describe("learning identity onboarding", () => {
  it("starts a new learner at the intro and does not treat them as ready", () => {
    expect(identitySetupView({ loading: false, status: "not_activated", serverDid: null })).toBe("intro");
  });

  it("shows an existing bound identity as ready", () => {
    expect(identitySetupView({ loading: false, status: "active", serverDid })).toBe("ready");
  });

  it("asks for the recovery password when the vault is locked", () => {
    expect(identitySetupView({ loading: false, status: "locked", serverDid })).toBe("unlock");
  });

  it("offers restore when the server identity has no local key", () => {
    expect(identitySetupView({ loading: false, status: "key_unavailable", serverDid })).toBe("restore");
  });

  it("treats a local key without a server binding as interrupted setup", () => {
    expect(identitySetupView({ loading: false, status: "active", serverDid: null })).toBe("finish");
  });

  it("keeps the loading state until status is known, including after refresh", () => {
    expect(identitySetupView({ loading: true, status: "not_activated", serverDid: null })).toBe("loading");
    expect(identitySetupView({ loading: false, status: "active", serverDid })).toBe("ready");
  });

  it("rejects a short or mismatched recovery password before any key is created", () => {
    expect(recoveryPasswordIssue("short", "short")).toMatch(/at least 10/);
    expect(recoveryPasswordIssue("long-enough-phrase", "other-phrase")).toMatch(/do not match/);
    expect(recoveryPasswordIssue("long-enough-phrase", "long-enough-phrase")).toBeNull();
  });

  it("explains a wrong recovery password without offering a reset", () => {
    expect(learnerIdentityError(new Error("Incorrect passphrase"))).toMatch(/cannot reset/);
  });

  it("explains an invalid recovery file", () => {
    expect(learnerIdentityError(new Error("Backup file is not valid JSON"))).toMatch(/not a valid recovery file/);
  });

  it("explains a recovery file for another identity", () => {
    expect(learnerIdentityError(new Error("This backup DID does not match the identity already bound"))).toMatch(/was not replaced/);
    expect(learnerIdentityError(new Error("This backup belongs to a different SIJIL account"))).toMatch(/another SIJIL account/);
    expect(learnerIdentityError(new Error("Restoring it would rotate the DID"))).toMatch(/was not replaced/);
  });

  it("explains a missing local key without creating a replacement", () => {
    expect(learnerIdentityError(new Error("refusing to generate a replacement DID"))).toMatch(/cannot be restored/);
  });

  it("explains a temporarily unavailable server", () => {
    expect(learnerIdentityError(new Error("SSI activation is temporarily unavailable"))).toMatch(/temporarily unavailable/);
  });

  it("does not put a private key in the registration request", () => {
    const body = bindRequestBody({
      challengeId: "11111111-1111-4111-8111-111111111111",
      did: serverDid,
      signature: "sig",
    });
    expect(body).toEqual({
      challengeId: "11111111-1111-4111-8111-111111111111",
      did: serverDid,
      signature: "sig",
    });
    expect(JSON.stringify(body)).not.toMatch(/privateKey|BEGIN PRIVATE KEY/);
  });

  it("accepts only wrapped recovery file text", () => {
    expect(recoveryFileIsWrapped("{\"ciphertext\":\"abc\"}")).toBe(true);
    expect(recoveryFileIsWrapped("-----BEGIN PRIVATE KEY-----\nabc")).toBe(false);
  });
});
