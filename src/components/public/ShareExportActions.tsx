import { useEffect, useMemo, useState } from "react";
import { Copy, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  appleWalletPassUrl,
  getGoogleWalletLinkApi,
  getWalletExportConfigApi,
} from "@/services/api/public-credential.api";
import { getAuthHeaders } from "@/services/api/client";

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return iOS && /WebKit/.test(ua) && !/CriOS|Chrome|EdgiOS|FxiOS/.test(ua);
}

async function downloadUrl(url: string, filename: string, authenticated = false) {
  const headers = authenticated ? await getAuthHeaders() : {};
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export function ShareExportActions({
  publicUrl,
  shareToken,
}: {
  publicUrl: string | null;
  shareToken?: string | null;
  shareId?: string | null;
}) {
  const [wallet, setWallet] = useState({ apple: false, google: false });
  const iosSafari = useMemo(() => isIosSafari(), []);

  useEffect(() => {
    void getWalletExportConfigApi().then(setWallet).catch(() => {
      setWallet({ apple: false, google: false });
    });
  }, []);

  const copyLink = async () => {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    toast({ title: "Public link copied" });
  };

  const addAppleWallet = async () => {
    if (!shareToken) return;
    try {
      await downloadUrl(appleWalletPassUrl(shareToken), "sijil-credential.pkpass");
    } catch (error) {
      toast({
        title: "Could not add to Apple Wallet",
        description: error instanceof Error ? error.message : "Wallet export failed.",
        variant: "destructive",
      });
    }
  };

  const addGoogleWallet = async () => {
    if (!shareToken) return;
    try {
      const saveUrl = await getGoogleWalletLinkApi(shareToken);
      window.open(saveUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast({
        title: "Could not add to Google Wallet",
        description: error instanceof Error ? error.message : "Wallet export failed.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="grid gap-2">
      <Button variant="outline" className="rounded-xl" onClick={() => void copyLink()} disabled={!publicUrl}>
        <Copy className="mr-1.5 h-4 w-4" />
        Copy public link
      </Button>
      {iosSafari && wallet.apple && shareToken ? (
        <Button variant="outline" className="rounded-xl" onClick={() => void addAppleWallet()}>
          <Wallet className="mr-1.5 h-4 w-4" />
          Add to Apple Wallet
        </Button>
      ) : null}
      {!iosSafari && wallet.google && shareToken ? (
        <Button variant="outline" className="rounded-xl" onClick={() => void addGoogleWallet()}>
          <Wallet className="mr-1.5 h-4 w-4" />
          Add to Google Wallet
        </Button>
      ) : null}
    </div>
  );
}
