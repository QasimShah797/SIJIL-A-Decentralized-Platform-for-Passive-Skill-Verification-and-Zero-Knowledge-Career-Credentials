import { ShieldOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function ShareRevokedState({
  title = "This share has been stopped",
  description = "The learner stopped this share. The shared details are no longer available.",
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
      title: "This share has expired",
      description: "Ask the learner for a new link.",
    },
    invalid: {
      title: "This share could not be checked",
      description: "The shared record is missing, expired, or no longer matches what SIJIL stored.",
    },
    missing: {
      title: "Share not found",
      description: "This link is incomplete or does not match a SIJIL share.",
    },
  }[status];

  return <ShareRevokedState title={copy.title} description={copy.description} />;
}
