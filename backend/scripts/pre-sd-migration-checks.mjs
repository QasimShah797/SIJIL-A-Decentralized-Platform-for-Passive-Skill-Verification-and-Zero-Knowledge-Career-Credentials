/**
 * Read-only preflight for credential_sd_claims migration.
 * Does not apply SQL or mutate rows.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const url = process.env.SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const projectRef = (() => {
  try {
    return new URL(url).host.split(".")[0];
  } catch {
    return "";
  }
})();

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

const tableProbe = await sb.from("credential_sd_claims").select("id").limit(1);
const tableExists = !tableProbe.error;
const tableMissing =
  !!tableProbe.error
  && /PGRST205|Could not find the table|schema cache|does not exist/i.test(String(tableProbe.error.message || ""));

const creds = await sb
  .from("credentials")
  .select("id, skill_name, credential_hash, revoked_at, updated_at, credential_document")
  .order("id", { ascending: true });

if (creds.error) {
  console.log(JSON.stringify({
    ok: false,
    stage: "credentials_snapshot",
    error: { code: creds.error.code, snippet: String(creds.error.message).slice(0, 160) },
  }, null, 2));
  process.exit(1);
}

const snapshotRows = (creds.data || []).map((row) => {
  const sd = row.credential_document?.selectiveDisclosure;
  return {
    id: row.id,
    skill_name: row.skill_name,
    credential_hash: row.credential_hash,
    revoked_at: row.revoked_at,
    updated_at: row.updated_at ?? null,
    hasSelectiveDisclosure: Boolean(sd),
    sdScheme: typeof sd?.scheme === "string" ? sd.scheme : null,
    sdDigestCount: Array.isArray(sd?.sd) ? sd.sd.length : 0,
  };
});

const backupDir = path.resolve(process.cwd(), "../.migration-backups");
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(backupDir, `credentials-pre-sd-claims-${stamp}.json`);
writeFileSync(backupPath, `${JSON.stringify({
  createdAt: new Date().toISOString(),
  projectRef,
  purpose: "Recoverable checksum snapshot before credential_sd_claims migration",
  credentialCount: snapshotRows.length,
  credentials: snapshotRows,
}, null, 2)}\n`);

console.log(JSON.stringify({
  projectRef,
  matchesTarget: projectRef === "nhzvtqpplfruzocframc",
  tableExists,
  tableMissing,
  tableError: tableProbe.error
    ? { code: tableProbe.error.code, snippet: String(tableProbe.error.message).slice(0, 160) }
    : null,
  credentialCount: snapshotRows.length,
  sdCapableBefore: snapshotRows.filter((r) => r.sdScheme === "sd-claim-digest-v1").length,
  localBackupPath: backupPath,
  hasAnonKey: Boolean(anonKey),
}, null, 2));
