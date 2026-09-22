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

  const token = parseTokenFromUrl(req, "public-credential");
  if (!token) return json({ error: "shareToken is required" }, 400);

  const row = await loadPresentationByToken(token);
  if (!row) return json({ error: "Presentation not found" }, 404);

  const verification = await verifyPresentation(row);
  const walletExport = walletExportAvailability();

  if (verification.status !== "valid") {
    return json({
      success: true,
      data: {
        status: verification.status,
        verified: false,
        verifiedAt: verification.verifiedAt,
        competencyId: row.competency_id,
        selectedFields: row.selected_fields,
        selectionMode: row.selection_mode,
        resume: null,
        webView: null,
        walletExport,
      },
    }, 200, { "Cache-Control": "no-store" });
  }

  return json({
    success: true,
    data: {
      status: "valid",
      verified: true,
      verifiedAt: verification.verifiedAt,
      competencyId: row.competency_id,
      selectedFields: row.selected_fields,
      selectionMode: row.selection_mode,
      resume: buildAtsResume(row.disclosed_payload, token, row.competency_id),
      webView: {
        disclosedPayload: row.disclosed_payload,
        proofType: row.proof_type,
        verificationMethod: row.verification_method,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        payloadHash: row.payload_hash,
      },
      walletExport,
    },
  });
});
