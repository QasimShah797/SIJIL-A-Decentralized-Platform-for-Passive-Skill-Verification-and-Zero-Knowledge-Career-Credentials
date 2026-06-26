import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AppRole, fetchUserRoles, pickPrimaryRole } from "@/lib/auth-helpers";
import { clearAllGitHubConnectionState } from "@/lib/github-env";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [rolesReady, setRolesReady] = useState(false);
  const prevUserIdRef = useRef<string | null>(null);

  const loadRoles = async (uid: string | undefined) => {
    if (!uid) {
      setRoles([]);
      setRolesReady(true);
      return;
    }
    setRolesReady(false);
    try {
      const r = await fetchUserRoles(uid);
      setRoles(r);
    } finally {
      setRolesReady(true);
    }
  };

  useEffect(() => {
    let mounted = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;

      const nextUserId = s?.user?.id ?? null;
      if (
        event === "SIGNED_OUT" ||
        (prevUserIdRef.current && prevUserIdRef.current !== nextUserId)
      ) {
        clearAllGitHubConnectionState();
      }
      prevUserIdRef.current = nextUserId;

      setSession(s);
      setLoading(false);
      void loadRoles(s?.user?.id);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      prevUserIdRef.current = data.session?.user?.id ?? null;
      setSession(data.session);
      setLoading(false);
      void loadRoles(data.session?.user?.id);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        rolesReady,
        role: pickPrimaryRole(roles),
        roles,
        refreshRoles: async () => loadRoles(session?.user?.id),
        signOut: async () => {
          clearAllGitHubConnectionState();
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
