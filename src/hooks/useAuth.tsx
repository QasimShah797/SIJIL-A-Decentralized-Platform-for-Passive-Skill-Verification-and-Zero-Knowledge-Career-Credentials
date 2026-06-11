import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AppRole, fetchUserRoles, pickPrimaryRole } from "@/lib/auth-helpers";
import { clearAllGitHubConnectionState } from "@/lib/github-env";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  roles: AppRole[];
  refreshRoles: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  user: null, session: null, loading: true, role: null, roles: [],
  refreshRoles: async () => {}, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const prevUserIdRef = useRef<string | null>(null);

  const loadRoles = async (uid: string | undefined) => {
    if (!uid) { setRoles([]); return; }
    const r = await fetchUserRoles(uid);
    setRoles(r);
  };

  useEffect(() => {
    let mounted = true;

    console.log("🔵 AuthProvider: starting session check");

    // Force stop loading after 3 seconds
    const timeout = setTimeout(() => {
      console.log("🔴 AuthProvider: timeout reached, forcing loading=false");
      if (mounted) setLoading(false);
    }, 3000);

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      console.log("🟡 onAuthStateChange fired, event:", event, "user:", s?.user?.email);
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
      clearTimeout(timeout);
      setTimeout(() => loadRoles(s?.user?.id), 0);
    });

    supabase.auth.getSession().then(({ data }) => {
      console.log("🟢 getSession result, user:", data.session?.user?.email ?? "NO SESSION");
      if (!mounted) return;
      prevUserIdRef.current = data.session?.user?.id ?? null;
      setSession(data.session);
      loadRoles(data.session?.user?.id);
      setLoading(false);
      clearTimeout(timeout);
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
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
