/**
 * Validates real GitHub repository evidence before it is copied into supporting_records.
 * Never invents titles or URLs.
 */

export const GITHUB_EVIDENCE_SOURCE = "GitHub";

export interface GitHubEvidenceInput {
  userId?: string | null;
  skillId?: string | null;
  skillOwnerId?: string | null;
  title?: string | null;
  url?: string | null;
}

export function normalizeGitHubRepoUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") return null;

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const owner = parts[0];
  let repo = parts[1];
  if (repo.toLowerCase().endsWith(".git")) repo = repo.slice(0, -4);
  if (!owner || !repo) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;

  return `https://github.com/${owner}/${repo}`.toLowerCase();
}

export function qualifyingGitHubTitle(title: string | null | undefined): string | null {
  if (typeof title !== "string") return null;
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isQualifyingGitHubEvidence(input: GitHubEvidenceInput): boolean {
  if (!input.userId || !input.skillId) return false;
  if (input.skillOwnerId && input.skillOwnerId !== input.userId) return false;
  return Boolean(qualifyingGitHubTitle(input.title) && normalizeGitHubRepoUrl(input.url));
}

export function findDuplicateGitHubSupportingRecord<T extends { url?: string | null }>(
  existing: T[],
  normalizedUrl: string,
): T | undefined {
  return existing.find((row) => normalizeGitHubRepoUrl(row.url ?? null) === normalizedUrl);
}
