import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { listVerificationNotifications, markVerificationNotificationRead, type VerificationNotificationView } from "@/services/api/zkp.api";

const POLL_MS = 20_000;

export function useVerificationNotifications(role: "learner" | "recruiter") {
  const { user } = useAuth();
  const instanceId = useId().replace(/:/g, "");
  const [notifications, setNotifications] = useState<VerificationNotificationView[]>([]);
  const [available, setAvailable] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await listVerificationNotifications(role);
      setAvailable(result.available);
      setNotifications(result.notifications);
    } catch {
      setNotifications([]);
    }
  }, [role]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, POLL_MS);
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (user?.id) {
      try {
        channel = supabase
          .channel(`zkp-notifications-${role}-${user.id}-${instanceId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "zkp_notifications", filter: `recipient_user_id=eq.${user.id}` },
            () => { void load(); },
          )
          .subscribe();
      } catch {
        channel = null;
      }
    }
    return () => {
      window.clearInterval(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [instanceId, load, role, user?.id]);

  const markRead = useCallback(async (id: string) => {
    const updated = await markVerificationNotificationRead(role, id);
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, readAt: updated.readAt ?? new Date().toISOString() } : item));
    await load();
  }, [load, role]);

  const unread = notifications.filter((item) => !item.readAt).length;
  return { notifications, unread, available, reload: load, markRead };
}
