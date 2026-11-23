import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  SharedPrivateVerificationPanel,
  countConfirmedPrivateResults,
  readPrivateResults,
} from "./SharedPrivateVerificationPanel";

describe("SharedPrivateVerificationPanel", () => {
  it("counts only confirmed private results", () => {
    expect(countConfirmedPrivateResults({
      privateResults: [
        { claimType: "practical_assessment", status: "confirmed", label: "Requirement met", proofType: "Groth16", threshold: "50" },
        { claimType: "peer_review", status: "confirmed", label: "Requirement met" },
        { claimType: "github_activity", status: "failed", label: "Could not confirm" },
        { claimType: "moodle_learning", status: "preparing", label: "Preparing result…" },
      ],
    })).toBe(1);
  });

  it("maps preparing status away from infinite preparing copy", () => {
    const rows = readPrivateResults({
      privateResults: [{ claimType: "peer_review", status: "preparing", label: "Preparing result…" }],
    });
    expect(rows[0]?.label).toBe("Could not confirm");
  });

  it("renders confirmed private results without inventing a verified badge when none exist", () => {
    render(
      <MemoryRouter>
        <SharedPrivateVerificationPanel
          competencyName="TypeScript"
          payload={{ privateResults: [] }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/No private ZKP results were shared/i)).toBeInTheDocument();
    expect(screen.queryByText("Requirement met")).not.toBeInTheDocument();
  });

  it("shows confirmed private ZKP labels from payload", () => {
    render(
      <MemoryRouter>
        <SharedPrivateVerificationPanel
          competencyName="Java"
          payload={{
            privateResults: [
              {
                claimType: "github_activity",
                status: "confirmed",
                label: "Requirement met",
                detailHidden: "Count hidden",
                proofType: "Groth16",
                threshold: "50",
              },
            ],
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/GitHub Activity/)).toBeInTheDocument();
    expect(screen.getByText("Groth16 · ≥50 verified commits")).toBeInTheDocument();
    expect(screen.getByText(/VERIFIED/)).toBeInTheDocument();
  });
});
