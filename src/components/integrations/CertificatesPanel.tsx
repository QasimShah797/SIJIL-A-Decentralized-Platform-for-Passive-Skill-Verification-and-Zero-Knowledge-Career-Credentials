import { FileUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StubControl } from "@/components/sijil/StubControl";
import { IntegrationEmptyState } from "./IntegrationEmptyState";
import { Link } from "react-router-dom";

export type CertificatesPanelProps = {
  onUpload: () => void;
};

export function CertificatesPanel({ onUpload: _onUpload }: CertificatesPanelProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <FileUp className="h-4 w-4" aria-hidden />
          Imported Certificates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <IntegrationEmptyState
          compact
          icon={FileUp}
          title="No external certificates uploaded"
          hint="Certificate evidence is coming soon. Connect GitHub or Moodle for verified evidence today."
          action={
            <StubControl
              label="Certificate evidence — coming soon"
              reason="Certificate upload will be available in a future release. Use GitHub or Moodle integrations as verified evidence sources."
            />
          }
        />
        <p className="text-xs text-muted-foreground">
          Meanwhile, add evidence via{" "}
          <Link to="/learner/integrations" className="text-primary underline-offset-2 hover:underline">
            Integrations
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
