import { createHash, createSign } from "node:crypto";
import forge from "node-forge";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import type { AtsResumeView, PublicShareStatus } from "../types/public-credential.types";

const ICON_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAYAAAA7MK1iAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA" +
  "IklEQVR4nO3BAQEAAACCIP+vbkhAAQAAAAAAAAAAAAAAAO8GKhAAAYH5I6cAAAAASUVORK5CYII=",
  "base64",
);

function origin(): string {
  return env.FRONTEND_URL.replace(/\/$/, "");
}

export function walletExportAvailability(): { apple: boolean; google: boolean } {
  return {
    apple: Boolean(env.APPLE_PASS_CERT && env.APPLE_PASS_KEY && env.APPLE_PASS_TYPE_ID && env.APPLE_PASS_TEAM_ID),
    google: Boolean(env.GOOGLE_WALLET_ISSUER_ID && env.GOOGLE_WALLET_SA_KEY),
  };
}

function verifyUrl(shareToken: string): string {
  return `${origin()}/credential/${encodeURIComponent(shareToken)}`;
}

function decodePem(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("BEGIN")) return trimmed.replace(/\\n/g, "\n");
  try {
    return Buffer.from(trimmed, "base64").toString("utf8");
  } catch {
    return trimmed;
  }
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const crc = crc32(file.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    locals.push(local, file.data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + file.data.length;
  }

  const localConcat = Buffer.concat(locals);
  const centralConcat = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralConcat.length, 12);
  end.writeUInt32LE(localConcat.length, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([localConcat, centralConcat, end]);
}

function sha1Hex(data: Buffer): string {
  return createHash("sha1").update(data).digest("hex");
}

function signManifest(manifest: Buffer): Buffer {
  const certPem = decodePem(env.APPLE_PASS_CERT ?? "");
  const keyPem = decodePem(env.APPLE_PASS_KEY ?? "");
  const wwdrPem = env.APPLE_PASS_WWDR ? decodePem(env.APPLE_PASS_WWDR) : "";
  const passphrase = env.APPLE_PASS_KEY_PASSPHRASE;

  const certificate = forge.pki.certificateFromPem(certPem);
  const privateKey = passphrase
    ? forge.pki.decryptRsaPrivateKey(keyPem, passphrase)
    : forge.pki.privateKeyFromPem(keyPem);
  if (!privateKey) {
    throw new AppError("Apple Wallet pass key could not be read", 500);
  }

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifest.toString("binary"));
  p7.addCertificate(certificate);
  if (wwdrPem) {
    p7.addCertificate(forge.pki.certificateFromPem(wwdrPem));
  }
  p7.addSigner({
    key: privateKey,
    certificate,
    digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
    ],
  });
  p7.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary");
}

export async function buildApplePkpass(params: {
  shareToken: string;
  resume: AtsResumeView;
  status: PublicShareStatus;
  verified: boolean;
}): Promise<Buffer> {
  if (!walletExportAvailability().apple) {
    throw new AppError("Apple Wallet export is not configured", 503);
  }

  const skill = params.resume.skills[0]?.name ?? "Credential";
  const pass = {
    formatVersion: 1,
    passTypeIdentifier: env.APPLE_PASS_TYPE_ID,
    serialNumber: params.shareToken.slice(0, 32),
    teamIdentifier: env.APPLE_PASS_TEAM_ID,
    organizationName: "SIJIL",
    description: "SIJIL verified credential",
    logoText: "SIJIL",
    foregroundColor: "rgb(255,255,255)",
    backgroundColor: "rgb(2,62,138)",
    generic: {
      primaryFields: [{ key: "skill", label: "SKILL", value: skill }],
      secondaryFields: [
        { key: "learner", label: "LEARNER", value: params.resume.name },
        {
          key: "trust",
          label: "TRUST",
          value: params.verified && params.status === "valid" ? "Verified" : params.status,
        },
      ],
    },
    barcodes: [{
      message: verifyUrl(params.shareToken),
      format: "PKBarcodeFormatQR",
      messageEncoding: "iso-8859-1",
    }],
  };

  const passJson = Buffer.from(JSON.stringify(pass), "utf8");
  const icon = ICON_PNG.length > 32 ? ICON_PNG : Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  const files = [
    { name: "pass.json", data: passJson },
    { name: "icon.png", data: icon },
    { name: "paula.r@example.org", data: icon },
  ];
  const manifest = Buffer.from(JSON.stringify(Object.fromEntries(
    files.map((file) => [file.name, sha1Hex(file.data)]),
  )), "utf8");
  const signature = signManifest(manifest);
  return zipStore([
    ...files,
    { name: "manifest.json", data: manifest },
    { name: "signature", data: signature },
  ]);
}

function parseServiceAccount(): { client_email: string; private_key: string } {
  const raw = env.GOOGLE_WALLET_SA_KEY ?? "";
  const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const parsed = JSON.parse(json) as { client_email?: string; private_key?: string };
  if (!parsed.client_email || !parsed.private_key) {
    throw new AppError("GOOGLE_WALLET_SA_KEY is invalid", 500);
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, "\n") };
}

function base64Url(value: string | Buffer): string {
  const buffer = typeof value === "string" ? Buffer.from(value) : value;
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function buildGoogleWalletLink(params: {
  shareToken: string;
  resume: AtsResumeView;
  status: PublicShareStatus;
  verified: boolean;
}): { saveUrl: string } {
  if (!walletExportAvailability().google) {
    throw new AppError("Google Wallet export is not configured", 503);
  }

  const account = parseServiceAccount();
  const issuerId = env.GOOGLE_WALLET_ISSUER_ID!;
  const classId = `${issuerId}.sijil_credential`;
  const objectId = `${issuerId}.${params.shareToken.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 40)}`;
  const skill = params.resume.skills[0]?.name ?? "Credential";
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: account.client_email,
    aud: "google",
    typ: "savetowallet",
    iat: now,
    payload: {
      genericObjects: [{
        id: objectId,
        classId,
        cardTitle: { defaultValue: { language: "en-US", value: "SIJIL Credential" } },
        header: { defaultValue: { language: "en-US", value: skill } },
        subheader: { defaultValue: { language: "en-US", value: params.resume.name } },
        textModulesData: [{
          id: "trust",
          header: "Trust status",
          body: params.verified && params.status === "valid" ? "Verified" : params.status,
        }],
        barcode: {
          type: "QR_CODE",
          value: verifyUrl(params.shareToken),
        },
        hexBackgroundColor: "#023E8A",
      }],
    },
  };

  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify(claims));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(account.private_key);
  const jwt = `${header}.${payload}.${base64Url(signature)}`;
  return { saveUrl: `https://pay.google.com/gp/v/save/${jwt}` };
}
