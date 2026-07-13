import { ReactNode } from "react";
import { AuthLeftPanel } from "@/components/auth/AuthLeftPanel";

type AuthEntryLayoutProps = {
  children: ReactNode;
};

export function AuthEntryLayout({ children }: AuthEntryLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <AuthLeftPanel />
        <div className="flex min-h-[calc(100vh-280px)] items-center justify-center px-4 py-10 sm:px-8 lg:min-h-screen lg:py-12">
          <div className="w-full max-w-md animate-fade-in">{children}</div>
        </div>
      </div>
    </div>
  );
}
