import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AtsResume } from "@/components/public/AtsResume";
import { ShareRevokedState, ShareUnavailableState } from "@/components/public/ShareRevokedState";
import { PublicSurfaceLayout } from "@/components/sijil/PublicSurfaceLayout";
import type { PublicCredentialResponse } from "@/lib/public-credential";
import { getPublicCredentialApi, publicResumePhotoUrl } from "@/services/api/public-credential.api";

export default function PublicCredentialPage() {
  const { shareToken } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [credential, setCredential] = useState<PublicCredentialResponse | null>(null);

  useEffect(() => {
    if (!shareToken) {
      setLoading(false);
      setError("missing");
      return;
    }
    let active = true;
    setLoading(true);
    getPublicCredentialApi(shareToken)
      .then((next) => {
        if (active) setCredential(next);
      })
      .catch(() => {
        if (active) setError("missing");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [shareToken]);

  return (
    <PublicSurfaceLayout accent="strong">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading credential…</p>
        ) : error === "missing" || !credential ? (
          <ShareUnavailableState status="missing" />
        ) : credential.status === "revoked" ? (
          <ShareRevokedState />
        ) : credential.status === "expired" ? (
          <ShareUnavailableState status="expired" />
        ) : credential.status === "invalid" ? (
          <ShareUnavailableState status="invalid" />
        ) : credential.resume ? (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Shared SIJIL resume · only disclosed fields are shown
            </p>
            <AtsResume
              resume={{
                ...credential.resume,
                photoUrl: credential.resume.photoUrl && shareToken
                  ? `${publicResumePhotoUrl(shareToken)}?v=profile`
                  : credential.resume.photoUrl,
              }}
              photoFallbackUrl={credential.resume.photoUrl}
              verified={credential.verified}
            />
          </div>
        ) : (
          <ShareUnavailableState status="invalid" />
        )}
      </div>
    </PublicSurfaceLayout>
  );
}
