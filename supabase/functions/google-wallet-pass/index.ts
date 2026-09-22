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

  if (!walletExportAvailability().google) {
    return json({ error: "Google Wallet export is not configured" }, 503);
  }

  const token = parseTokenFromUrl(req, "google-wallet-pass") ?? new URL(req.url).searchParams.get("shareToken");
  if (!token) return json({ error: "shareToken is required" }, 400);

  const row = await loadPresentationByToken(token);
  if (!row) return json({ error: "Presentation not found" }, 404);
  const verification = await verifyPresentation(row);
  if (verification.status === "revoked") return json({ error: "This credential share has been revoked" }, 410);
  if (verification.status !== "valid") return json({ error: "Wallet pass is not available for this share" }, 409);

  const resume = buildAtsResume(row.disclosed_payload, token, row.competency_id);
  const frontend = (Deno.env.get("FRONTEND_URL") ?? "").replace(/\/$/, "");
  const verifyUrl = `${frontend}/credential/${encodeURIComponent(token)}`;

  return json({
    success: true,
    data: {
      issuerId: Deno.env.get("GOOGLE_WALLET_ISSUER_ID"),
      learner: resume.name,
      skill: resume.skills[0]?.name ?? "Credential",
      trustStatus: verification.verified ? "Verified" : verification.status,
      verifyUrl,
      notice: "Signed Add to Google Wallet JWTs are issued by the SIJIL API when GOOGLE_WALLET_SA_KEY is present.",
    },
  });
});
