/**
 * SHA-256 of evidence file bytes, or of canonical metadata for links/GitHub records.
 */
import { createHash } from "node:crypto";
import { canonicalizeJson } from "./canonicalize";

export interface EvidenceMetadata {
  source: string;
  title: string;
  url?: string | null;
  repositoryName?: string | null;
  repositoryUrl?: string | null;
}

export function hashEvidenceBytes(bytes: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function hashEvidenceMetadata(record: EvidenceMetadata): string {
  return hashEvidenceBytes(
    canonicalizeJson({
      source: record.source,
      title: record.title,
      url: record.url ?? null,
      repositoryName: record.repositoryName ?? null,
      repositoryUrl: record.repositoryUrl ?? null,
    }),
  );
}

export function hashEvidenceRecord(
  record: EvidenceMetadata,
  fileBytes?: Buffer | Uint8Array,
): string {
  if (fileBytes && fileBytes.byteLength > 0) {
    return hashEvidenceBytes(fileBytes);
  }
  return hashEvidenceMetadata(record);
}

export function sortedEvidenceHashes(hashes: Array<string | null | undefined>): string[] {
  return hashes.filter((hash): hash is string => typeof hash === "string" && hash.length > 0).sort();
}

export function evidenceHashesMatch(stored: string[], live: string[]): boolean {
  const left = sortedEvidenceHashes(stored);
  const right = sortedEvidenceHashes(live);
  if (left.length !== right.length) return false;
  return left.every((hash, index) => hash === right[index]);
}

export function evidenceHashesFromDocument(document: unknown): string[] | null {
  if (!document || typeof document !== "object") return null;
  const subject = (document as { credentialSubject?: { evidenceHashes?: unknown } }).credentialSubject;
  if (!subject || !Array.isArray(subject.evidenceHashes)) return null;
  return subject.evidenceHashes.filter((hash): hash is string => typeof hash === "string");
}

export const SKILL_EVIDENCE_BUCKET = "skill-evidence";
export const MAX_EVIDENCE_FILE_BYTES = 10 * 1024 * 1024;
export const EVIDENCE_DOWNLOAD_TIMEOUT_MS = 8_000;

export function evidenceFileTooLarge(bytes: Buffer | Uint8Array): boolean {
  return bytes.byteLength > MAX_EVIDENCE_FILE_BYTES;
}

export function skillEvidenceStoragePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${SKILL_EVIDENCE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = decodeURIComponent(url.slice(idx + marker.length).split("?")[0] ?? "");
  return path.length > 0 ? path : null;
}

export type EvidenceDownloadResult = Buffer | "unavailable" | null;

export interface LiveEvidenceRow {
  content_hash?: string | null;
  source: string;
  title: string;
  url?: string | null;
}

export interface LiveEvidenceOutcome {
  storedHashes: string[] | null;
  liveHashes: string[];
  mismatch: boolean;
  unavailable: boolean;
  legacy: boolean;
}

export async function computeLiveEvidenceIntegrity(
  rows: LiveEvidenceRow[],
  storedDocument: unknown,
  downloadFile: (path: string) => Promise<EvidenceDownloadResult>,
): Promise<LiveEvidenceOutcome> {
  const storedHashes = evidenceHashesFromDocument(storedDocument);
  const legacy = storedHashes === null;

  if (legacy) {
    return {
      storedHashes: null,
      liveHashes: [],
      mismatch: false,
      unavailable: false,
      legacy: true,
    };
  }

  const liveHashes: string[] = [];
  for (const row of rows) {
    const path = skillEvidenceStoragePath(row.url);
    if (path) {
      const downloaded = await downloadFile(path);
      if (downloaded === "unavailable" || downloaded === null || evidenceFileTooLarge(downloaded)) {
        return {
          storedHashes,
          liveHashes: [],
          mismatch: false,
          unavailable: true,
          legacy: false,
        };
      }
      liveHashes.push(hashEvidenceBytes(downloaded));
      continue;
    }
    const resolved = resolveLiveEvidenceHash(row);
    if (!resolved.matchesStored) {
      return {
        storedHashes,
        liveHashes: [],
        mismatch: true,
        unavailable: false,
        legacy: false,
      };
    }
    liveHashes.push(resolved.hash);
  }

  return {
    storedHashes,
    liveHashes: sortedEvidenceHashes(liveHashes),
    mismatch: !evidenceHashesMatch(storedHashes, liveHashes),
    unavailable: false,
    legacy: false,
  };
}

export function resolveLiveEvidenceHash(row: {
  content_hash?: string | null;
  source: string;
  title: string;
  url?: string | null;
  repositoryName?: string | null;
  repositoryUrl?: string | null;
}): { hash: string; matchesStored: boolean } {
  const recomputed = hashEvidenceMetadata({
    source: row.source,
    title: row.title,
    url: row.url,
    repositoryName: row.repositoryName,
    repositoryUrl: row.repositoryUrl,
  });
  const stored = typeof row.content_hash === "string" ? row.content_hash.trim() : "";
  if (!stored) return { hash: recomputed, matchesStored: true };
  if (stored === recomputed) return { hash: stored, matchesStored: true };
  return { hash: recomputed, matchesStored: false };
}

