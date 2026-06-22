/** GitHub REST import labels for peer_reviews. */
export const REVIEW_SOURCE = {
  GITHUB: "github",
  SIJIL: "sijil",
} as const;

export type ReviewSource = (typeof REVIEW_SOURCE)[keyof typeof REVIEW_SOURCE];
