/** Relationship-based trust weights for evidence-based peer reviews. */

export const RELATIONSHIP = {
  MENTOR: "mentor",
  TEACHER: "teacher",
  SUPERVISOR: "supervisor",
  TEAMMATE: "teammate",
  CONTRIBUTOR: "contributor",
  CLASSMATE: "classmate",
  PEER: "peer",
} as const;

export type Relationship = (typeof RELATIONSHIP)[keyof typeof RELATIONSHIP];

export const TRUST_WEIGHT_SCORES: Record<Relationship, number> = {
  mentor: 1.0,
  teacher: 1.0,
  supervisor: 0.95,
  teammate: 0.85,
  contributor: 0.8,
  classmate: 0.6,
  peer: 0.5,
};

export const HIGH_TRUST_THRESHOLD = 0.85;
export const MEDIUM_TRUST_THRESHOLD = 0.65;

export const PEER_REVIEW_INVITE_STATUS = {
  SENT: "sent",
  COMPLETED: "completed",
  EXPIRED: "expired",
} as const;

export const PEER_REVIEW_TOKEN_TTL_DAYS = 14;

export const CONTEXT_STATUS = {
  VERIFIED: "Context Verified",
  PENDING: "Context Pending",
  NOT_VERIFIED: "Context Not Verified",
} as const;

export const CONTRIBUTOR_VERIFICATION = {
  VERIFIED: "Contributor Verified",
  PENDING: "Contributor Pending Verification",
  NOT_CONTRIBUTOR: "Not a Project Contributor",
} as const;

export const PEER_REVIEW_RECOMMENDATION = {
  RECOMMENDED: "Recommended",
  NEEDS_MORE: "Needs More Evidence",
  CANNOT_CONFIRM: "Cannot Confirm",
  SUPPORT: "Support",
  NOT_ENOUGH: "Not Enough Context",
} as const;

/** Map UI / synced contributor roles to canonical relationship keys. */
export function relationshipFromRole(role: string): Relationship {
  const normalized = role.toLowerCase().replace(/[_-]/g, " ");
  if (normalized.includes("mentor")) return RELATIONSHIP.MENTOR;
  if (normalized.includes("teacher")) return RELATIONSHIP.TEACHER;
  if (normalized.includes("supervisor")) return RELATIONSHIP.SUPERVISOR;
  if (normalized.includes("teammate")) return RELATIONSHIP.TEAMMATE;
  if (normalized.includes("class fellow") || normalized.includes("classmate")) {
    return RELATIONSHIP.CLASSMATE;
  }
  if (
    normalized.includes("collaborator")
    || normalized.includes("contributor")
    || normalized.includes("same repo")
    || normalized.includes("repo")
  ) {
    return RELATIONSHIP.CONTRIBUTOR;
  }
  return RELATIONSHIP.PEER;
}

/** Categorical trust label for the Peer Reviews UI. */
export function categoricalTrustWeight(score: number): "High Trust" | "Medium Trust" | "Low Trust" {
  if (score >= HIGH_TRUST_THRESHOLD) return "High Trust";
  if (score >= MEDIUM_TRUST_THRESHOLD) return "Medium Trust";
  return "Low Trust";
}

export function trustScoreForRelationship(relationship: Relationship, contextVerified = true): number {
  if (!contextVerified) return TRUST_WEIGHT_SCORES.peer;
  return TRUST_WEIGHT_SCORES[relationship];
}

/** Display role for UI — never expert/intermediate/beginner skill levels. */
export function displayRoleForRelationship(relationship: Relationship): string {
  switch (relationship) {
    case RELATIONSHIP.MENTOR: return "Mentor";
    case RELATIONSHIP.TEACHER: return "Teacher";
    case RELATIONSHIP.SUPERVISOR: return "Supervisor";
    case RELATIONSHIP.TEAMMATE: return "Teammate";
    case RELATIONSHIP.CLASSMATE: return "Class Fellow";
    case RELATIONSHIP.CONTRIBUTOR: return "Project Collaborator";
    default: return "Peer";
  }
}
