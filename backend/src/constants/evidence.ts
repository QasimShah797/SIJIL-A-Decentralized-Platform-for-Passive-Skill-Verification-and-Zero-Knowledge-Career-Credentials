/**
 * Evidence record and GitHub sync status constants.
 */
export const EVIDENCE_RECORD_STATUS = {
  UNMAPPED: "Unmapped Project Evidence",
  PROJECT: "Project Evidence",
  MAPPED: "Mapped",
  IGNORED: "Ignored",
} as const;

export const EVIDENCE_TYPE = {
  PROJECT: "Project Evidence",
} as const;

export const GITHUB_SYNC_STATUS = {
  NOT_SYNCED: "Not Synced",
  SYNCING: "Syncing",
  SYNCED: "Synced",
  FAILED: "Failed",
} as const;

export const EVIDENCE_SOURCE = {
  GITHUB: "GitHub",
  UPLOAD: "Upload",
} as const;
