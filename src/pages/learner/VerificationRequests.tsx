import { Link } from "react-router-dom";
import { LearnerWorkspaceShell } from "@/components/sijil/LearnerWorkspaceShell";
import { useVerificationNotifications } from "@/hooks/useVerificationNotifications";
import { formatTimestamp } from "@/components/zkp/policy-outcome";

export function walletDestination(requestId: string): string {
  return `/learner/wallet?verification=${encodeURIComponent(requestId)}`;
}

export default function LearnerVerificationRequests() {
  const { notifications, available, markRead } = useVerificationNotifications("learner");

  return (
    <LearnerWorkspaceShell variant="dashboard">
      <section className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Verification notifications</h1>
          <p className="mt-1 text-sm text-[#475569]">
            These notices tell you that a recruiter sent a verification request. Review, approve, reject, and proof generation stay in your Wallet.
          </p>
        </div>
        {!available ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Notifications are not ready until the verification notification table is applied. This is not a verified proof.
          </p>
        ) : null}
        {notifications.length === 0 ? <p className="text-sm text-[#64748b]">No verification notifications yet.</p> : (
          <ul className="space-y-3">
            {notifications.map((item) => (
              <li key={item.id} className="rounded-2xl border border-[#e2e8f0] bg-white p-4">
                <p className="text-sm font-semibold text-[#0f172a]">{item.title}</p>
                <p className="mt-1 text-sm text-[#334155]">{item.body}</p>
                <p className="mt-1 text-xs text-[#64748b]">{formatTimestamp(item.createdAt)}{item.readAt ? "" : " · Unread"}</p>
                <Link
                  className="mt-3 inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent"
                  to={walletDestination(item.requestId)}
                  onClick={() => { if (!item.readAt) void markRead(item.id); }}
                >
                  Open in Wallet
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </LearnerWorkspaceShell>
  );
}
