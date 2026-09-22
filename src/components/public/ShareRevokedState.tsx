import { ShieldOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function ShareRevokedState({
  title = "This credential share has been revoked",
  description = "The learner withdrew this presentation. The disclosed credential is no longer available.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Card className="border-destructive/30">
      <CardContent className="flex flex-col items-center px-6 py-12 text-center">
        <ShieldOff className="h-10 w-10 text-destructive" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">{title}</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export function ShareUnavailableState({
  status,
}: {
  status: "expired" | "invalid" | "missing";
}) {
  const copy = {
    expired: {
      title: "This credential share has expired",
      description: "Ask the learner to generate a new public link.",
    },
    invalid: {
      title: "This credential share could not be verified",
      description: "The signed payload is missing, expired, or no longer matches the stored proof.",
    },
    missing: {
      title: "Credential share not found",
      description: "This public link is incomplete or does not match a SIJIL presentation.",
    },
  }[status];

  return <ShareRevokedState title={copy.title} description={copy.description} />;
}
