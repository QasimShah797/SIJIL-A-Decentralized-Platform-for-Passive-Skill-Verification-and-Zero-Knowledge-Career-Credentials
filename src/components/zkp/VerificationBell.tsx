import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useVerificationNotifications } from "@/hooks/useVerificationNotifications";

export function VerificationBell({ role }: { role: "learner" | "recruiter" }) {
  const navigate = useNavigate();
  const { unread } = useVerificationNotifications(role);
  // Recruiters inspect learner-shared proofs from the directory; legacy request inbox is learner-only.
  const destination = role === "learner" ? "/learner/verification-requests" : "/recruiter/search";
  return (
    <button
      type="button"
      onClick={() => navigate(destination)}
      className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1f5f9]"
      aria-label={
        role === "recruiter"
          ? "Open candidate directory"
          : unread > 0
            ? `${unread} verification notifications`
            : "Verification notifications"
      }
    >
      <Bell className="h-4 w-4 text-[#334155]" />
      {role === "learner" && unread > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#4f46e5] px-1 text-[10px] font-semibold text-white">
          {unread}
        </span>
      ) : null}
    </button>
  );
}
