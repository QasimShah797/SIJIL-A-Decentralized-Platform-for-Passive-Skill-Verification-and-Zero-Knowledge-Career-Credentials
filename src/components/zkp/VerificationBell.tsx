import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useVerificationNotifications } from "@/hooks/useVerificationNotifications";

export function VerificationBell({ role }: { role: "learner" | "recruiter" }) {
  const navigate = useNavigate();
  const { unread } = useVerificationNotifications(role);
  const destination = role === "learner" ? "/learner/verification-requests" : "/recruiter/verification-requests";
  return (
    <button
      type="button"
      onClick={() => navigate(destination)}
      className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1f5f9]"
      aria-label={unread > 0 ? `${unread} skill confirmation notifications` : "Skill confirmation notifications"}
    >
      <Bell className="h-4 w-4 text-[#334155]" />
      {unread > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#4f46e5] px-1 text-[10px] font-semibold text-white">
          {unread}
        </span>
      ) : null}
    </button>
  );
}
