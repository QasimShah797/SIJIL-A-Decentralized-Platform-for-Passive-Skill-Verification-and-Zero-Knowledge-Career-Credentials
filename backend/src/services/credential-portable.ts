/**
 * Read-only export of an already issued credential.
 * The stored document, proof, and hash are copied. Nothing is re-signed.
 */
import { supabaseService } from "./supabase.service";
import { AppError } from "../utils/AppError";

export const PORTABLE_CREDENTIAL_FORMAT = "SIJIL-CREDENTIAL-v1";

export type PortableCredentialFile = {
  format: typeof PORTABLE_CREDENTIAL_FORMAT;
  document: Record<string, unknown>;
  proof: {
    type: string;
    cryptosuite: string;
    created: string;
    verificationMethod: string;
    proofValue: string;
    proofPurpose: string;
  };
  credentialHash: string;
};

const SECRET_KEY = /privatekey|private_key|service_role|access_token|refresh_token|client_secret/i;
const SECRET_TEXT = /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|service_role/;

function containsSecret(value: unknown): boolean {
  if (typeof value === "string") return SECRET_TEXT.test(value);
  if (Array.isArray(value)) return value.some(containsSecret);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => {
    return SECRET_KEY.test(key) || containsSecret(nested);
  });
}

function proofField(proof: Record<string, unknown>, key: string): string {
  const value = proof[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new AppError("Signed credential proof is unavailable", 404);
  }
  return value;
}

export function portableCredentialFromStored(row: {
  credential_document?: unknown;
  proof?: unknown;
  credential_hash?: string | null;
}): PortableCredentialFile {
  const document = row.credential_document;
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new AppError("Signed credential document is unavailable", 404);
  }
  const proof = row.proof;
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) {
    throw new AppError("Signed credential proof is unavailable", 404);
  }
  const credentialHash = row.credential_hash ?? "";
  if (!/^[0-9a-f]{64}$/.test(credentialHash)) {
    throw new AppError("Signed credential hash is unavailable", 404);
  }
  const proofRecord = proof as Record<string, unknown>;
  const file: PortableCredentialFile = {
    format: PORTABLE_CREDENTIAL_FORMAT,
    document: document as Record<string, unknown>,
    proof: {
      type: proofField(proofRecord, "type"),
      cryptosuite: proofField(proofRecord, "cryptosuite"),
      created: proofField(proofRecord, "created"),
      verificationMethod: proofField(proofRecord, "verificationMethod"),
      proofValue: proofField(proofRecord, "proofValue"),
      proofPurpose: proofField(proofRecord, "proofPurpose"),
    },
    credentialHash,
  };
  if (containsSecret(file)) {
    throw new AppError("Refusing to export this credential", 500);
  }
  return file;
}

export async function exportOwnedCredential(
  userId: string,
  credentialUri: string,
): Promise<PortableCredentialFile> {
  const { data, error } = await supabaseService.client
    .from("credentials")
    .select("credential_document, proof, credential_hash")
    .eq("user_id", userId)
    .eq("credential_uri", credentialUri)
    .maybeSingle();

  if (error) throw new AppError(error.message, 500);
  if (!data) throw new AppError("Credential not found", 404);
  return portableCredentialFromStored(data);
}
