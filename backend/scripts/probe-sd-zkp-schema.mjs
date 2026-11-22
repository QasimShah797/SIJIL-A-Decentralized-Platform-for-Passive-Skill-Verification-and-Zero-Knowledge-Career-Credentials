/**
 * Read-only schema/readiness probe. Does not mutate data or apply migrations.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log(JSON.stringify({ error: "missing_supabase_env" }));
  process.exit(0);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function probe(name, builder) {
  const r = await builder;
  return {
    name,
    ok: !r.error,
    code: r.error?.code ?? null,
    snippet: r.error ? String(r.error.message).slice(0, 180) : null,
    rows: Array.isArray(r.data) ? r.data.length : null,
    count: r.count ?? null,
    sampleKeys: Array.isArray(r.data) && r.data[0] ? Object.keys(r.data[0]).slice(0, 14) : [],
  };
}

const results = [];
results.push(await probe(
  "credential_sd_claims.select",
  sb.from("credential_sd_claims").select("id, credential_id, claim_id, created_at").limit(3),
));
results.push(await probe(
  "github_zkp_proofs.select",
  sb.from("github_zkp_proofs").select("id").limit(1),
));
results.push(await probe(
  "github_contribution_proofs.select",
  sb.from("github_contribution_proofs").select("id, snapshot_id, threshold, public_commitment, created_at").limit(3),
));
results.push(await probe(
  "github_contribution_snapshots.select",
  sb.from("github_contribution_snapshots").select("id, repository_full_name, commitment_circuit_id, verified_at").limit(2),
));
results.push(await probe(
  "github_contribution_openings.meta",
  sb.from("github_contribution_openings").select("snapshot_id, learner_user_id, created_at").limit(1),
));
results.push(await probe(
  "assessment_openings.meta",
  sb.from("assessment_openings").select("attempt_id, learner_user_id, created_at").limit(1),
));
results.push(await probe(
  "credentials.sample",
  sb.from("credentials").select("id, skill_name, revoked_at").is("revoked_at", null).limit(10),
));

const credDocs = await sb.from("credentials").select("id, credential_document").is("revoked_at", null).limit(20);
let sdCapable = 0;
for (const row of credDocs.data || []) {
  const sd = row.credential_document?.selectiveDisclosure;
  if (sd?.scheme === "sd-claim-digest-v1" && Array.isArray(sd.sd)) sdCapable += 1;
}

const openapi = await fetch(`${url}/rest/v1/`, {
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
  },
});
const specText = await openapi.text();
const names = [
  "credential_sd_claims",
  "github_zkp_proofs",
  "github_contribution_proofs",
  "github_contribution_snapshots",
  "github_contribution_openings",
  "assessment_openings",
];
const inOpenApi = Object.fromEntries(
  names.map((n) => [n, specText.includes(`/${n}`) || specText.includes(`"${n}"`)]),
);

console.log(JSON.stringify({
  host: new URL(url).host,
  results,
  sdCapableCredentialsInSample: sdCapable,
  credentialsSampleFetched: (credDocs.data || []).length,
  openApiStatus: openapi.status,
  openApiMentions: inOpenApi,
}, null, 2));
