import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ReusableScoreProofCard } from "./ReusableScoreProofCard";

describe("ReusableScoreProofCard", () => {
  it("renders nothing after retirement of request workflow", () => {
    const { container } = render(<ReusableScoreProofCard shareToken="share-token-123456" />);
    expect(container.firstChild).toBeNull();
  });
});
