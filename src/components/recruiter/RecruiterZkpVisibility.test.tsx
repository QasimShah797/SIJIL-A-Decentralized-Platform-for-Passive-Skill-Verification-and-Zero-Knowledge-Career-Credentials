import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { CandidateView } from "@/lib/db/candidates";
import { RecruiterCandidateCard } from "./RecruiterCandidateCard";
import { RecruiterDashboardStats } from "./RecruiterDashboardStats";

const candidate: CandidateView = {
  id: "candidate-1",
  name: "Test candidate",
  topSkill: "TypeScript",
  evidence: 2,
  reviews: 0,
  attestation: "Approved",
  institution: "Test university",
  credentialCount: 1,
  confirmedPrivateResults: 17,
};

describe("recruiter ZKP visibility", () => {
  it("keeps the approval and credential counts visible and hides ZKP-only totals", () => {
    render(
      <MemoryRouter>
        <RecruiterCandidateCard candidate={candidate} onOpenSummary={vi.fn()} />
        <RecruiterDashboardStats
          candidates={[candidate, { ...candidate, id: "candidate-2", attestation: "Pending" }]}
          active="all"
          onSelect={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /Approved disclosure/ })).getByText("1")).toBeInTheDocument();
    expect(screen.queryByText(/ZKP/i)).not.toBeInTheDocument();
    expect(screen.queryByText("17")).not.toBeInTheDocument();
  });
});
