import { ReactNode } from "react";
import { AuthLeftPanel } from "@/components/auth/AuthLeftPanel";

type AuthEntryLayoutProps = {
  children: ReactNode;
};

export function AuthEntryLayout({ children }: AuthEntryLayoutProps) {
  return (
    <div className="auth-page">
      <AuthLeftPanel />
      <div className="auth-page-right">
        <div className="auth-page-card">{children}</div>
      </div>
    </div>
  );
}
