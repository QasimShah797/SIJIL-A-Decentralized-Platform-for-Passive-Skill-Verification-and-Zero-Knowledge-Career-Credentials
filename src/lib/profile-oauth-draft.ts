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
  try {
    sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Database progress still saves when session storage is unavailable.
  }
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
  try {
    sessionStorage.removeItem(`${DRAFT_PREFIX}${kind}_${userId}`);
  } catch {
    // The completion flag is stored in the database.
  }
}

/** Store the optional file separately from the sessionStorage text draft. */
export function accessProfileAvatarDraft(userId: string, file?: File | null): Promise<File | null> {
  return new Promise<File | null>((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }

    const open = indexedDB.open("sijil-profile-drafts", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("avatars");
    open.onerror = () => resolve(null);
    open.onblocked = () => resolve(null);
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction("avatars", file === undefined ? "readonly" : "readwrite");
      const store = transaction.objectStore("avatars");
      const request = file === undefined ? store.get(userId) :
        file === null ? store.delete(userId) : store.put(file, userId);
      transaction.oncomplete = () => {
        db.close();
        resolve(file === undefined ? request.result ?? null : null);
      };
      transaction.onabort = () => { db.close(); resolve(null); };
    };
  }).catch(() => null);
}
