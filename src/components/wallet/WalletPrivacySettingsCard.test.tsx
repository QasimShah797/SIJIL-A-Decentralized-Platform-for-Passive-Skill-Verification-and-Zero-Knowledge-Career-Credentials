import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletPrivacySettingsCard } from "./WalletPrivacySettingsCard";
import { GitHubPolicyStatusCard } from "./GitHubPolicyStatusCard";
import { getDisclosurePreferencesApi, updateDisclosurePreferencesApi } from "@/services/api/wallet.api";
import { getZkpStatus, listGitHubEvidence } from "@/services/api/github-zkp.api";

vi.mock("@/services/api/wallet.api", () => ({
  getDisclosurePreferencesApi: vi.fn(),
  updateDisclosurePreferencesApi: vi.fn(),
}));
vi.mock("@/services/api/github-zkp.api", () => ({
  getZkpStatus: vi.fn(),
  listGitHubEvidence: vi.fn(),
}));
vi.mock("@/lib/github-integration", () => ({ startGitHubOAuth: vi.fn() }));

const OFF = { shareExactAssessmentMarks: false, shareExactGithubCommitCount: false, updatedAt: null };

describe("WalletPrivacySettingsCard", () => {
  beforeEach(() => {
    vi.mocked(getDisclosurePreferencesApi).mockReset().mockResolvedValue(OFF);
    vi.mocked(updateDisclosurePreferencesApi).mockReset();
  });

  it("shows both settings OFF by default", async () => {
    render(<WalletPrivacySettingsCard />);
    const marks = await screen.findByRole("switch", { name: "Share exact assessment marks" });
    const commits = screen.getByRole("switch", { name: "Share exact GitHub commit count" });
    await waitFor(() => expect(marks).not.toBeDisabled());
    expect(marks).toHaveAttribute("aria-checked", "false");
    expect(commits).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/only whether you met the 60% policy/)).toBeInTheDocument();
  });

  it("sends only the toggled permission and never thresholds or values", async () => {
    vi.mocked(updateDisclosurePreferencesApi).mockResolvedValue({ ...OFF, shareExactGithubCommitCount: true });
    render(<WalletPrivacySettingsCard />);
    const commits = await screen.findByRole("switch", { name: "Share exact GitHub commit count" });
    await waitFor(() => expect(commits).not.toBeDisabled());
    fireEvent.click(commits);
    await waitFor(() => expect(commits).toHaveAttribute("aria-checked", "true"));
    expect(vi.mocked(updateDisclosurePreferencesApi)).toHaveBeenCalledWith({ shareExactGithubCommitCount: true });
  });
});

describe("GitHubPolicyStatusCard", () => {
  it("is read-only: no repository input, check, refresh, or share-code controls", async () => {
    vi.mocked(listGitHubEvidence).mockResolvedValue({ github: { connected: true, username: "octo" } } as never);
    vi.mocked(getZkpStatus).mockResolvedValue({
      available: true,
      assessment: [],
      github: [{
        evidenceRef: "repo:octo/demo",
        evidenceScope: { repositoryFullName: "octo/demo" },
        outcome: "BELOW_THRESHOLD",
        threshold: 70,
        evidenceFreshAt: null,
        updatedAt: null,
        errorCode: null,
      }],
      policy: { assessmentThreshold: 60, githubThreshold: 70 },
    } as never);
    render(<GitHubPolicyStatusCard competencyId="java-skill-id" />);
    expect(await screen.findByText("octo/demo")).toBeInTheDocument();
    expect(vi.mocked(getZkpStatus)).toHaveBeenCalledWith("java-skill-id");
    expect(screen.getByRole("status").textContent).toMatch(/threshold 70/);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the empty state when no GitHub evidence is linked to the competency", async () => {
    vi.mocked(listGitHubEvidence).mockResolvedValue({ github: { connected: true, username: "octo" } } as never);
    vi.mocked(getZkpStatus).mockResolvedValue({
      available: true,
      assessment: [],
      github: [],
      policy: { assessmentThreshold: 60, githubThreshold: 70 },
    } as never);
    render(<GitHubPolicyStatusCard competencyId="python-skill-id" />);
    expect(await screen.findByText("No GitHub evidence linked to this competency yet.")).toBeInTheDocument();
    expect(vi.mocked(getZkpStatus)).toHaveBeenCalledWith("python-skill-id");
  });
});
