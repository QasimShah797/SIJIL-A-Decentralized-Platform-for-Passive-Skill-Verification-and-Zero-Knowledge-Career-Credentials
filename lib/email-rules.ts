import { supabase } from "@/integrations/supabase/client";

export const PERSONAL_EMAIL_DOMAINS = [
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "live.com", "aol.com", "proton.me", "protonmail.com", "msn.com", "yahoo.co.uk",
];

export function emailDomain(email: string): string {
  return (email.split("@")[1] ?? "").toLowerCase().trim();
}

export function isPersonalEmail(email: string): boolean {
  return PERSONAL_EMAIL_DOMAINS.includes(emailDomain(email));
}

export async function isTrustedInstitutionDomain(email: string): Promise<boolean> {
  const dom = emailDomain(email);
  if (!dom) return false;
  const { data } = await supabase
    .from("trusted_institution_domains")
    .select("domain")
    .eq("domain", dom)
    .maybeSingle();
  return !!data;
}

export const DECENTRALIZED_NOTE =
  "SIJIL uses automated verification, platform identity linking, and selective disclosure to support decentralized trust. SIJIL does not centrally assign skill levels or replace institutional credential issuance.";
