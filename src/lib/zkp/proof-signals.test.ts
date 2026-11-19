import { describe, expect, it } from "vitest";
import { proofSignalsMatch } from "./generate-score-proof";

const commitment = "4507768595048672970581706270570294537909576572913353501816464357845450185450";

describe("public score signals", () => {
  it("allows a score that equals the public threshold", () => {
    expect(proofSignalsMatch(["60", commitment], 60, commitment)).toBe(true);
  });

  it("rejects a different threshold, a different commitment, and an extra signal", () => {
    expect(proofSignalsMatch(["61", commitment], 60, commitment)).toBe(false);
    expect(proofSignalsMatch(["60", "1"], 60, commitment)).toBe(false);
    expect(proofSignalsMatch(["60", commitment, "73"], 60, commitment)).toBe(false);
  });
});
