import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AssessmentProofRequestCard } from "./AssessmentProofRequestCard";

describe("AssessmentProofRequestCard", () => {
  it("no longer offers proof request controls", () => {
    render(<AssessmentProofRequestCard shareToken="share-token-123456" />);
    expect(screen.queryByRole("button", { name: /Request .* proof/i })).toBeNull();
    expect(screen.getByText(/Private verification requests are retired/i)).toBeTruthy();
  });
});
