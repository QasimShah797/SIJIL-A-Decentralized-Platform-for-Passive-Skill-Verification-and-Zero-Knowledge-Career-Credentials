/**
 * Shared API response and pagination types.
 */
export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface SearchQuery extends PaginationQuery {
  q?: string;
  skill?: string;
  institution?: string;
}
