/**
 * Post-migration verification for credential_sd_claims.
 * Read-only except a temporary service-role insert that is deleted.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const url = process.env.SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.SUPABASE_ANON_KEY || "";
const projectRef = new URL(url).host.split(".")[0];

const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = anonKey
  ? createClient(url, anonKey, { auth: { persistSession: false } })
  : null;

const out = {
  projectRef,
  matchesTarget: projectRef === "nhzvtqpplfruzocframc",
};

// 1) Table exists
const existsProbe = await service.from("credential_sd_claims").select("id", { count: "exact", head: true });
out.table = existsProbe.error
  ? { exists: false, code: existsProbe.error.code, snippet: String(existsProbe.error.message).slice(0, 160) }
  : { exists: true, count: existsProbe.count ?? 0 };

// OpenAPI mention
const openapi = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
});
const spec = await openapi.text();
out.openApiMentionsTable = spec.includes("credential_sd_claims");

// 2) RLS / anon protection
if (anon) {
  const anonSelect = await anon.from("credential_sd_claims").select("id, salt").limit(5);
  out.anonSelect = {
    errorCode: anonSelect.error?.code ?? null,
    errorSnippet: anonSelect.error ? String(anonSelect.error.message).slice(0, 160) : null,
    rows: Array.isArray(anonSelect.data) ? anonSelect.data.length : null,
    saltsExposed: Array.isArray(anonSelect.data)
      ? anonSelect.data.some((r) => typeof r?.salt === "string" && r.salt.length > 0)
      : false,
  };

  // Attempt anon insert (must fail)
  const anonInsert = await anon.from("credential_sd_claims").insert({
    credential_id: "00000000-0000-4000-8000-000000000000",
    claim_id: "probe",
    salt: "should-fail",
    value_fingerprint: "00",
  });
  out.anonInsertBlocked = Boolean(anonInsert.error);
  out.anonInsert = {
    errorCode: anonInsert.error?.code ?? null,
    errorSnippet: anonInsert.error ? String(anonInsert.error.message).slice(0, 160) : null,
  };
} else {
  out.anonSelect = { skipped: true, reason: "no_anon_key" };
}

// Service role can read (empty ok)
const serviceSelect = await service.from("credential_sd_claims").select("id, claim_id, created_at").limit(5);
out.serviceSelect = {
  ok: !serviceSelect.error,
  rows: serviceSelect.data?.length ?? 0,
  errorSnippet: serviceSelect.error ? String(serviceSelect.error.message).slice(0, 160) : null,
  saltsInResponse: JSON.stringify(serviceSelect.data || []).includes("salt"),
};

// 3) Credentials unchanged vs latest local backup
const backupDir = path.resolve(process.cwd(), "../.migration-backups");
const backups = readdirSync(backupDir)
  .filter((f) => f.startsWith("credentials-pre-sd-claims-") && f.endsWith(".json"))
  .sort();
const latestBackup = backups.at(-1);
if (!latestBackup) {
  out.credentialsCompare = { ok: false, reason: "no_backup_file" };
} else {
  const backup = JSON.parse(readFileSync(path.join(backupDir, latestBackup), "utf8"));
  const live = await service
    .from("credentials")
    .select("id, skill_name, credential_hash, revoked_at, credential_document")
    .order("id", { ascending: true });
  if (live.error) {
    out.credentialsCompare = { ok: false, reason: "live_query_failed", snippet: String(live.error.message).slice(0, 160) };
  } else {
    const before = new Map((backup.credentials || []).map((r) => [r.id, r]));
    const afterRows = live.data || [];
    const after = new Map(afterRows.map((r) => {
      const sd = r.credential_document?.selectiveDisclosure;
      return [r.id, {
        id: r.id,
        skill_name: r.skill_name,
        credential_hash: r.credential_hash,
        revoked_at: r.revoked_at,
        sdScheme: typeof sd?.scheme === "string" ? sd.scheme : null,
        sdDigestCount: Array.isArray(sd?.sd) ? sd.sd.length : 0,
      }];
    }));

    const missing = [];
    const changed = [];
    for (const [id, prev] of before) {
      const next = after.get(id);
      if (!next) {
        missing.push(id);
        continue;
      }
      if (
        prev.credential_hash !== next.credential_hash
        || prev.skill_name !== next.skill_name
        || (prev.revoked_at ?? null) !== (next.revoked_at ?? null)
        || (prev.sdScheme ?? null) !== (next.sdScheme ?? null)
        || (prev.sdDigestCount ?? 0) !== (next.sdDigestCount ?? 0)
      ) {
        changed.push(id);
      }
    }
    const added = [...after.keys()].filter((id) => !before.has(id));
    out.credentialsCompare = {
      ok: missing.length === 0 && changed.length === 0,
      backupFile: latestBackup,
      beforeCount: before.size,
      afterCount: after.size,
      missingCount: missing.length,
      changedCount: changed.length,
      addedCount: added.length,
      sdCapableAfter: [...after.values()].filter((r) => r.sdScheme === "sd-claim-digest-v1").length,
    };
  }
}

console.log(JSON.stringify(out, null, 2));
