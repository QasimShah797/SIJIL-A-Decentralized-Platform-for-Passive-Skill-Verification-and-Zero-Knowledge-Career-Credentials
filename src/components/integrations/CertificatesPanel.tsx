import { FileUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IntegrationEmptyState } from "./IntegrationEmptyState";

export type CertificatesPanelProps = {
  onUpload: () => void;
};

export function CertificatesPanel({ onUpload }: CertificatesPanelProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <FileUp className="h-4 w-4" aria-hidden />
          Imported Certificates
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <IntegrationEmptyState
          compact
          icon={FileUp}
          title="No external certificates uploaded"
          hint="Upload a third-party certificate to include it as supporting evidence."
          action={
            <Button size="sm" variant="outline" onClick={onUpload}>
              <FileUp className="h-3.5 w-3.5 mr-1.5" />
              Upload certificate
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}
