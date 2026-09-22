import { StatusBadge } from "@/components/sijil/StatusBadge";
import type { TrustTier, TrustTierLabel } from "@/lib/public-credential";

export function TrustTierBadge({
  trustTier,
  trustTierLabel,
}: {
  trustTier: TrustTier;
  trustTierLabel: TrustTierLabel;
}) {
  return (
    <StatusBadge variant={trustTier === "lms_preverified" ? "verified" : "info"} showDefaultIcon>
      {trustTierLabel}
    </StatusBadge>
  );
}
