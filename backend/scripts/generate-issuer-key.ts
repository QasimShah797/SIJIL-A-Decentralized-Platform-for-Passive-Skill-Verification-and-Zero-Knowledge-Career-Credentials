/**
 * Generate a new Ed25519 issuer keypair and print base64-encoded PEMs.
 *
 * Usage (from backend/):
 *   npm run generate:issuer-key
 *
 * openssl alternative:
 *   openssl genpkey -algorithm ED25519 -out issuer-ed25519-private.pem
 *   openssl pkey -in issuer-ed25519-private.pem -pubout -out issuer-ed25519-public.pem
 *   # Unix:    base64 -w0 issuer-ed25519-private.pem && echo && base64 -w0 issuer-ed25519-public.pem
 *   # macOS:   base64 -i issuer-ed25519-private.pem && echo && base64 -i issuer-ed25519-public.pem
 *   # PowerShell:
 *   #   [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Content -Raw issuer-ed25519-private.pem)))
 */
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

console.log("# Add these to backend/.env (do not commit the private key)");
console.log(`ISSUER_ED25519_PRIVATE_KEY=${Buffer.from(privatePem, "utf8").toString("base64")}`);
console.log(`ISSUER_ED25519_PUBLIC_KEY=${Buffer.from(publicPem, "utf8").toString("base64")}`);
