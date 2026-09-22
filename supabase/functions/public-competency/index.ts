import {
  buildEvidenceLedger,
  competencyFromSharePayload,
  corsHeaders,
  json,
  loadPresentationByToken,
  parseTokenFromUrl,
  verifyPresentation,
} from "../_shared/public-credential.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const fnIndex = parts.findIndex((part) => part === "public-competency");
  const token = fnIndex >= 0
    ? decodeURIComponent(parts[fnIndex + 1] ?? "")
    : parseTokenFromUrl(req, "public-competency");
  const competencyId = fnIndex >= 0
    ? decodeURIComponent(parts[fnIndex + 2] ?? url.searchParams.get("competencyId") ?? "")
    : (url.searchParams.get("competencyId") ?? "");

  if (!token || !competencyId) return json({ error: "shareToken and competencyId are required" }, 400);

  const row = await loadPresentationByToken(token);
  if (!row) return json({ error: "Presentation not found" }, 404);

  const verification = await verifyPresentation(row);
  if (verification.status !== "valid") {
    return json({
      success: true,
      data: {
        status: verification.status,
        verified: false,
        verifiedAt: verification.verifiedAt,
        competency: null,
        ledger: null,
      },
    }, 200, { "Cache-Control": "no-store" });
  }

  const competency = competencyFromSharePayload(row.disclosed_payload, competencyId, row.competency_id);
  if (!competency) return json({ error: "This competency was not included in the share" }, 404);

  return json({
    success: true,
    data: {
      status: "valid",
      verified: true,
      verifiedAt: verification.verifiedAt,
      competency,
      ledger: buildEvidenceLedger(row.disclosed_payload, competencyId, row.selected_fields),
    },
  });
});
