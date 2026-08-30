import { Shield } from "lucide-react";

export function AuthSecureFooter() {
  return (
    <p className="auth-secure-footer">
      <Shield className="h-3 w-3 shrink-0" aria-hidden />
      Protected by decentralized identity &amp; zero-knowledge verification
    </p>
  );
}
