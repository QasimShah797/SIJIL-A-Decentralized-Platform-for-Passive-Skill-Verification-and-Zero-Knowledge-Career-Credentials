const DRAFT_PREFIX = "sijil_profile_draft_";

export type ProfileDraftKind = "self_signup" | "institution";

type StoredDraft<T> = {
  savedAt: string;
  form: T;
};

export function saveProfileFormDraft<T extends object>(
  userId: string,
  kind: ProfileDraftKind,
  form: T,
): void {
  const key = `${DRAFT_PREFIX}${kind}_${userId}`;
  const payload: StoredDraft<T> = { savedAt: new Date().toISOString(), form };
  sessionStorage.setItem(key, JSON.stringify(payload));
}

export function loadProfileFormDraft<T extends object>(
  userId: string,
  kind: ProfileDraftKind,
): T | null {
  try {
    const key = `${DRAFT_PREFIX}${kind}_${userId}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft<T>;
    return parsed.form ?? null;
  } catch {
    return null;
  }
}

export function clearProfileFormDraft(userId: string, kind: ProfileDraftKind): void {
  sessionStorage.removeItem(`${DRAFT_PREFIX}${kind}_${userId}`);
}
