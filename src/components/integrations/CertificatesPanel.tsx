import { FileUp, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StubControl } from "@/components/sijil/StubControl";

export type CertificatesPanelProps = {
  onUpload: () => void;
};

export function CertificatesPanel({ onUpload }: CertificatesPanelProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-[#023E8A]">Imported Certificates</h2>
      <div className="overflow-hidden rounded-2xl bg-[#023E8A] text-white shadow-lg">
        <div className="grid gap-6 p-6 lg:grid-cols-2 lg:items-center lg:p-8">
          <div>
            <h3 className="text-lg font-semibold">No external certificates uploaded</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/80">
              Upload third-party certificates as supporting evidence. Files are reviewed manually and linked to your
              decentralized identity when verified.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                className="rounded-xl bg-white text-[#023E8A] hover:bg-white/90"
                onClick={onUpload}
              >
                <FileUp className="mr-1.5 h-4 w-4" />
                Upload Certificate
              </Button>
              <StubControl
                label="Learn how verification works"
                reason="Certificate verification guide will be available in a future release."
                className="border-white/30 bg-transparent px-0 py-0 text-sm text-white/90 opacity-100"
              />
            </div>
          </div>
          <div
            className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/30 bg-white/5 px-6 py-8 text-center"
            onClick={onUpload}
            onKeyDown={(e) => e.key === "Enter" && onUpload()}
            role="button"
            tabIndex={0}
          >
            <Upload className="mb-3 h-8 w-8 text-white/70" aria-hidden />
            <p className="text-sm font-medium">Drag &amp; drop a certificate</p>
            <p className="mt-1 text-xs text-white/60">PDF, PNG, or JPG · Max 10 MB · Linked to your DID</p>
          </div>
        </div>
      </div>
    </div>
  );
}
