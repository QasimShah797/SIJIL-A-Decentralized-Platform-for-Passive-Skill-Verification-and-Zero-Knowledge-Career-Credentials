import { describe, expect, it } from "vitest";
import { competencyJourney } from "./recruiter-journey";

describe("competency journey", () => {
  it("keeps one disclosed credential as a single version", () => {
    const versions = competencyJourney([
      { id: "cred-1", skill: "TypeScript", issuedAt: "2026-01-01T00:00:00.000Z", issuer: "Capital University", status: "Shared" },
    ], "TypeScript");
    expect(versions).toHaveLength(1);
    expect(versions[0].issuer).toBe("Capital University");
  });

  it("orders only the credentials shared for that skill", () => {
    const versions = competencyJourney([
      { id: "later", skill: "TypeScript", issuedAt: "2026-06-01T00:00:00.000Z" },
      { id: "other", skill: "SQL", issuedAt: "2026-03-01T00:00:00.000Z" },
      { id: "earlier", skill: "typescript", issuedAt: "2026-01-01T00:00:00.000Z" },
    ], "TypeScript");
    expect(versions.map((version) => version.id)).toEqual(["earlier", "later"]);
  });
});
