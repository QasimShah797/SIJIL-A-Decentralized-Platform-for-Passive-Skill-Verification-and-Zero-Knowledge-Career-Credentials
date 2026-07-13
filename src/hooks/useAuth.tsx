import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AppRole, fetchUserRoles, pickPrimaryRole } from "@/lib/auth-helpers";
import { clearAllGitHubConnectionState } from "@/lib/github-env";
import {
  clearLinkedInOAuthState,
  resetLinkedInConfiguredCache,
} from "@/lib/db/linkedin-connections";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  rolesReady: boolean;
  role: AppRole | null;
  roles: AppRole[];
  refreshRoles: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  rolesReady: false,
  role: null,
  roles: [],
  refreshRoles: async () => {},
  signOut: async () => {},
});

/** Session refresh / tab focus must not reload roles or reset auth UI state. */
function isBackgroundSessionEvent(event: AuthChangeEvent): boolean {
  return event === "TOKEN_REFRESHED";
}

function isDuplicateSignIn(
  event: AuthChangeEvent,
  prevUserId: string | null,
  nextUserId: string | null,
  rolesLoadedForUserId: string | null,
): boolean {
  return (
    event === "SIGNED_IN" &&
    !!nextUserId &&
    prevUserId === nextUserId &&
    rolesLoadedForUserId === nextUserId
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [rolesReady, setRolesReady] = useState(false);
  const prevUserIdRef = useRef<string | null>(null);
  const rolesUserIdRef = useRef<string | null>(null);
  const initialSessionHandledRef = useRef(false);

  const loadRoles = useCallback(async (uid: string | undefined, opts?: { force?: boolean }) => {
    if (!uid) {
      rolesUserIdRef.current = null;
      setRoles([]);
      setRolesReady(true);
      return;
    }

    if (!opts?.force && rolesUserIdRef.current === uid) {
      return;
    }

    const isUserChange = rolesUserIdRef.current !== uid;
    if (isUserChange) {
      setRolesReady(false);
    }

    try {
      const r = await fetchUserRoles(uid);
      setRoles(r);
      rolesUserIdRef.current = uid;
    } catch (err) {
      console.warn("Could not load user roles:", err);
      setRoles([]);
      rolesUserIdRef.current = uid;
    } finally {
      setRolesReady(true);
    }
  }, []);

  const applyAuthChange = useCallback(
    (event: AuthChangeEvent, s: Session | null) => {
      const nextUserId = s?.user?.id ?? null;
      const prevUserId = prevUserIdRef.current;

      if (event === "INITIAL_SESSION" && initialSessionHandledRef.current) {
        setSession(s);
        setLoading(false);
        return;
      }
      if (event === "INITIAL_SESSION") {
        initialSessionHandledRef.current = true;
      }

      if (isBackgroundSessionEvent(event)) {
        setSession(s);
        setLoading(false);
        return;
      }

      if (isDuplicateSignIn(event, prevUserId, nextUserId, rolesUserIdRef.current)) {
        setSession(s);
        setLoading(false);
        return;
      }

      if (
        event === "SIGNED_OUT" ||
        (prevUserId && prevUserId !== nextUserId)
      ) {
        clearAllGitHubConnectionState();
        clearLinkedInOAuthState();
        resetLinkedInConfiguredCache();
      }

      if (
        event === "SIGNED_IN" ||
        event === "INITIAL_SESSION"
      ) {
        resetLinkedInConfiguredCache();
        clearLinkedInOAuthState();
      }

      if (event === "SIGNED_OUT") {
        prevUserIdRef.current = null;
        rolesUserIdRef.current = null;
        setSession(null);
        setRoles([]);
        setRolesReady(true);
        setLoading(false);
        return;
      }

      prevUserIdRef.current = nextUserId;
      setSession(s);
      setLoading(false);

      if (
        event === "SIGNED_IN" ||
        event === "INITIAL_SESSION" ||
        event === "USER_UPDATED" ||
        event === "PASSWORD_RECOVERY"
      ) {
        void loadRoles(nextUserId ?? undefined);
      }
    },
    [loadRoles],
  );

  useEffect(() => {
    let mounted = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;
      applyAuthChange(event, s);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      applyAuthChange("INITIAL_SESSION", data.session);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [applyAuthChange]);

  const signOut = useCallback(async () => {
    clearAllGitHubConnectionState();
    clearLinkedInOAuthState();
    resetLinkedInConfiguredCache();
    await supabase.auth.signOut();
  }, []);

  const refreshRoles = useCallback(async () => {
    await loadRoles(session?.user?.id, { force: true });
  }, [loadRoles, session?.user?.id]);

  const value = useMemo<AuthCtx>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      rolesReady,
      role: pickPrimaryRole(roles),
      roles,
      refreshRoles,
      signOut,
    }),
    [session, loading, rolesReady, roles, refreshRoles, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
