/** UI-only learner profile fields stored locally until a DB migration adds them. */

const STORAGE_PREFIX = "sijil_profile_ui_";

export type ProfileUiFields = {
  dateOfBirth?: string;
  gender?: string;
  graduationYear?: string;
};

export function saveProfileUiFields(userId: string, fields: ProfileUiFields): void {
  try {
    const existing = loadProfileUiFields(userId);
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify({ ...existing, ...fields }));
  } catch {
    // localStorage unavailable — UI-only fields are best-effort.
  }
}

export function loadProfileUiFields(userId: string): ProfileUiFields {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (!raw) return {};
    return JSON.parse(raw) as ProfileUiFields;
  } catch {
    return {};
  }
}

export function clearProfileUiFields(userId: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${userId}`);
  } catch {
    // ignore
  }
}
