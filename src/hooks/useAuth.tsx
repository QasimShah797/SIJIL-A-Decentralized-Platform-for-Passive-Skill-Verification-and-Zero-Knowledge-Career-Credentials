import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AppRole, fetchUserRoles, pickPrimaryRole } from "@/lib/auth-helpers";

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

  const loadRoles = async (uid: string | undefined) => {
    if (!uid) { setRoles([]); return; }
    const r = await fetchUserRoles(uid);
    setRoles(r);
  };

  useEffect(() => {
    let mounted = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!mounted) return;
      setSession(s);
      setLoading(false);
      setTimeout(() => loadRoles(s?.user?.id), 0);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      loadRoles(data.session?.user?.id);
      setLoading(false);
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
        role: pickPrimaryRole(roles),
        roles,
        refreshRoles: async () => loadRoles(session?.user?.id),
        signOut: async () => { await supabase.auth.signOut(); },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
