import {
  buildAtsResume,
  corsHeaders,
  json,
  loadPresentationByToken,
  parseTokenFromUrl,
  verifyPresentation,
  walletExportAvailability,
} from "../_shared/public-credential.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  if (!walletExportAvailability().apple) {
    return json({ error: "Apple Wallet export is not configured" }, 503);
  }

  const token = parseTokenFromUrl(req, "apple-wallet-pass") ?? new URL(req.url).searchParams.get("shareToken");
  if (!token) return json({ error: "shareToken is required" }, 400);

  const row = await loadPresentationByToken(token);
  if (!row) return json({ error: "Presentation not found" }, 404);
  const verification = await verifyPresentation(row);
  if (verification.status === "revoked") return json({ error: "This credential share has been revoked" }, 410);
  if (verification.status !== "valid") return json({ error: "Wallet pass is not available for this share" }, 409);

  const resume = buildAtsResume(row.disclosed_payload, token, row.competency_id);
  const frontend = (Deno.env.get("FRONTEND_URL") ?? "").replace(/\/$/, "");
  const verifyUrl = `${frontend}/credential/${encodeURIComponent(token)}`;
  const pass = {
    formatVersion: 1,
    passTypeIdentifier: Deno.env.get("APPLE_PASS_TYPE_ID"),
    serialNumber: token.slice(0, 32),
    teamIdentifier: Deno.env.get("APPLE_PASS_TEAM_ID"),
    organizationName: "SIJIL",
    description: "SIJIL verified credential",
    generic: {
      primaryFields: [{ key: "skill", label: "SKILL", value: resume.skills[0]?.name ?? "Credential" }],
      secondaryFields: [
        { key: "learner", label: "LEARNER", value: resume.name },
        { key: "trust", label: "TRUST", value: verification.verified ? "Verified" : verification.status },
      ],
    },
    barcodes: [{
      message: verifyUrl,
      format: "PKBarcodeFormatQR",
      messageEncoding: "iso-8859-1",
    }],
  };

  return json({
    success: true,
    data: {
      pass,
      verifyUrl,
      notice: "Signed .pkpass bytes are issued by the SIJIL API when APPLE_PASS_CERT and APPLE_PASS_KEY are present.",
    },
  });
});
