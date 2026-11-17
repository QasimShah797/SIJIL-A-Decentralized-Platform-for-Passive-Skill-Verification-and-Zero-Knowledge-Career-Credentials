import { AppShell } from "@/components/sijil/AppShell";
import { Button } from "@/components/ui/button";
import { useVerificationNotifications } from "@/hooks/useVerificationNotifications";
import { formatTimestamp } from "@/components/zkp/policy-outcome";

export default function RecruiterVerificationRequests() {
  const { notifications, available, markRead } = useVerificationNotifications("recruiter");
  return (
    <AppShell role="recruiter">
      <section className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Verification updates</h1>
          <p className="mt-1 text-sm text-[#475569]">These notices say whether a learner approved, declined, verified, or let a request expire. Open the candidate verification card to inspect the result. They do not include the exact score, and they cannot approve, reject, or submit a proof.</p>
        </div>
        {!available ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Notifications are not ready until the verification notification table is applied.
          </p>
        ) : null}
        {notifications.length === 0 ? <p className="text-sm text-[#64748b]">No verification updates yet.</p> : (
          <ul className="space-y-3">
            {notifications.map((item) => (
              <li key={item.id} className="rounded-2xl border border-[#e2e8f0] bg-white p-4">
                <p className="text-sm font-semibold text-[#0f172a]">{item.title}</p>
                <p className="mt-1 text-sm text-[#334155]">{item.body}</p>
                <p className="mt-1 text-xs text-[#64748b]">{formatTimestamp(item.createdAt)}{item.readAt ? "" : " · Unread"}</p>
                {item.readAt ? null : (
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void markRead(item.id)}>
                    Mark as read
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
