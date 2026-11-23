import type { SsiUiStatus } from "./ownership";
import { SSI_PASSPHRASE_MIN } from "./vault";

export const IDENTITY_SETUP_PATH = "/learner/secure-identity";
export const SSI_IDENTITY_LOOKUP_ERROR =
  "SIJIL could not check the learning identity on your account. Please try again before continuing setup.";

export type IdentitySetupView =
  | "loading"
  | "lookup_failed"
  | "intro"
  | "ready"
  | "finish"
  | "unlock"
  | "restore"
  | "unsupported";

export function identitySetupView(input: {
  loading: boolean;
  status: SsiUiStatus;
  serverDid: string | null;
  serverLookupFailed?: boolean;
}): IdentitySetupView {
  if (input.loading) return "loading";
  if (input.status === "unsupported") return "unsupported";
  if (input.serverLookupFailed) return "lookup_failed";
  if (input.status === "locked") return "unlock";
  if (input.status === "key_unavailable") return "restore";
  if (input.status === "active" && input.serverDid) return "ready";
  if (input.status === "active") return "finish";
  return "intro";
}

export function learnerIdentityError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Something went wrong. Please try again.";
  if (message === SSI_IDENTITY_LOOKUP_ERROR) return message;
  if (/Incorrect passphrase/i.test(message)) {
    return "That recovery password is incorrect, or this recovery file is corrupted. SIJIL cannot reset the password.";
  }
  if (/fingerprint does not match|missing wrapped key material/i.test(message)) {
    return "This recovery file is corrupted. Your existing identity was not replaced.";
  }
  if (/not valid JSON|malformed|Not a SIJIL|missing DID metadata/i.test(message)) {
    return "This file is not a valid recovery file.";
  }
  if (/different SIJIL account/i.test(message)) {
    return "This recovery file belongs to another SIJIL account. Your identity was not replaced.";
  }
  if (/rotate the DID|does not match the identity|existing DID was not replaced/i.test(message)) {
    return "This recovery file does not match the learning identity on your account. Your identity was not replaced.";
  }
  if (/verification is temporarily unavailable/i.test(message)) {
    return "SIJIL could not check this identity. Nothing was restored. Try again when the connection is available.";
  }
  if (/Restoration stopped/i.test(message)) {
    return "Restoration stopped before this device finished checking your identity. Your existing identity was not replaced. Try again with the same recovery file.";
  }
  if (/temporarily unavailable|migration is applied|503|storage is not ready/i.test(message)) {
    return "The server is temporarily unavailable. Your key is still on this device. Please try again.";
  }
  if (/Choose a recovery file/i.test(message)) {
    return "Choose a recovery file to continue.";
  }
  if (/already registered|already exists on this device|already has a registered/i.test(message)) {
    return "This account already has a learning identity. A new one was not created.";
  }
  if (/non-extractable key and cannot be exported|cannot be passphrase-wrapped/i.test(message)) {
    return "This browser-only identity cannot be turned into a recovery file.";
  }
  if (/does not have the private key|not have the private key|refusing to generate a replacement/i.test(message)) {
    return "This browser does not have the key for your learning identity. A browser-only identity cannot be restored.";
  }
  return "We could not finish that step. Please try again.";
}

export function recoveryPasswordIssue(password: string, confirm: string): string | null {
  if (password.length < SSI_PASSPHRASE_MIN) {
    return `Use at least ${SSI_PASSPHRASE_MIN} characters. A short phrase is easier to remember than a short password.`;
  }
  if (password.trim() !== password) {
    return "The recovery password cannot start or end with a space.";
  }
  if (password !== confirm) return "The recovery passwords do not match.";
  return null;
}

export function recoveryFileIsWrapped(raw: string): boolean {
  return raw.includes("\"ciphertext\"") && !/BEGIN PRIVATE KEY/.test(raw);
}
