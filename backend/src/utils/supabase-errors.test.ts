import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isMissingColumnError, isMissingRelationError, isUniqueViolation } from "./supabase-errors";

describe("supabase schema mismatch errors", () => {
  it("detects a missing table as a relation error", () => {
    assert.equal(
      isMissingRelationError({
        code: "PGRST205",
        message: "Could not find the table 'public.skill_evidence_links' in the schema cache",
      }),
      true,
    );
    assert.equal(isMissingRelationError({ code: "42P01", message: "relation does not exist" }), true);
    assert.equal(isMissingRelationError({ message: "permission denied" }), false);
  });

  it("detects a missing column error", () => {
    assert.equal(isMissingColumnError({ code: "42703", message: "column declared_skills.updated_at does not exist" }), true);
    assert.equal(isMissingColumnError({ message: "duplicate key" }), false);
  });

  it("detects unique constraint violations", () => {
    assert.equal(isUniqueViolation({ code: "23505", message: "duplicate key value violates unique constraint" }), true);
    assert.equal(isUniqueViolation({ message: "permission denied" }), false);
  });
});
