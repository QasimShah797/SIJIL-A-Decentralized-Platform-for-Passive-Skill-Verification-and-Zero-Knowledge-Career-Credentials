const RETURN_TO_KEY = "sijil_linkedin_return_to";
/** Legacy keys — no longer written; cleared on auth reset. */
const LEGACY_CONFIG_KEYS = ["sijil_linkedin_configured", "sijil_linkedin_oauth_configured"] as const;

/** Persist return path across OAuth redirect (form draft saved separately). */
export function saveLinkedInReturnTo(returnTo: string) {
  sessionStorage.setItem(RETURN_TO_KEY, returnTo);
}

export function loadLinkedInReturnTo(): string | null {
  return sessionStorage.getItem(RETURN_TO_KEY);
}

export function clearLinkedInReturnTo() {
  sessionStorage.removeItem(RETURN_TO_KEY);
}

export function getLinkedInOAuthReturnTo(): string {
  return loadLinkedInReturnTo() ?? "/learner/complete-profile";
}

/** Remove browser-side LinkedIn OAuth state (call on sign-in, sign-out, user switch). */
export function clearLinkedInOAuthState() {
  clearLinkedInReturnTo();
  for (const key of LEGACY_CONFIG_KEYS) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}
