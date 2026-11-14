import { Link } from "react-router-dom";
import { identitySetupView } from "@/lib/ssi/onboarding";
import type { SsiUiStatus } from "@/lib/ssi/ownership";

export function IdentitySetupReminder({
  loading,
  status,
  serverDid,
}: {
  loading: boolean;
  status: SsiUiStatus;
  serverDid: string | null;
}) {
  const view = identitySetupView({ loading, status, serverDid });
  if (view === "loading" || view === "ready") return null;
  const copy = view === "unlock"
    ? "Enter your recovery password to approve new shares from this device."
    : view === "restore"
      ? "This browser does not have the key for your secure identity. A new one will not be created."
      : view === "finish"
        ? "Finish connecting the identity already on this device. A new one will not be created."
        : "Set up your secure identity so you can keep proof of your achievements and share them when you choose.";
  const action = view === "unlock" ? "Unlock Identity" : view === "restore" ? "Restore Identity" : "Get Started";
  return (
    <aside className="learner-stat-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-[#023E8A]">Set up your secure identity</p>
        <p className="text-sm text-[#475569]">{copy}</p>
      </div>
      <Link to="/learner/secure-identity" className="inline-flex h-9 items-center justify-center rounded-md bg-[#023E8A] px-3 text-sm font-medium text-white">
        {action}
      </Link>
    </aside>
  );
}
