import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertDeclaredSkill } from "./skills";
import { createSkillApi } from "@/services/api/skills.api";
import { syncGitHubAfterSkillDeclare } from "@/lib/github-integration";

const row = {
  id: "skill", name: "TypeScript", domain: "General", description: null, status: "Skill Claimed",
  last_related_activity_at: null, last_credential_sync_at: null,
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({
    select: () => ({ eq: async () => ({ data: [], error: null }) }),
    insert: () => ({ select: () => ({ single: async () => ({ data: row, error: null }) }) }),
  }) },
}));
vi.mock("@/services/api/skills.api", () => ({ createSkillApi: vi.fn() }));
vi.mock("@/lib/github-integration", () => ({ syncGitHubAfterSkillDeclare: vi.fn() }));

describe("competency declaration", () => {
  beforeEach(() => vi.resetAllMocks());

  it("asks the backend to defer evidence processing and avoids a second GitHub sync", async () => {
    const skill = { id: row.id, name: row.name, domain: row.domain, description: "", status: row.status,
      lastRelatedActivityAt: null, lastCredentialSyncAt: null };
    vi.mocked(createSkillApi).mockResolvedValue({ skill, relatedEvidence: [], evidenceStatus: "none" });
    await expect(insertDeclaredSkill("user", { name: row.name }, [], vi.fn())).resolves.toEqual(skill);
    expect(createSkillApi).toHaveBeenCalledWith({ name: row.name }, true);
    expect(syncGitHubAfterSkillDeclare).not.toHaveBeenCalled();
  });

  it("returns the saved fallback competency while GitHub sync is still pending", async () => {
    vi.mocked(createSkillApi).mockResolvedValue(null);
    let finishSync!: () => void;
    vi.mocked(syncGitHubAfterSkillDeclare).mockReturnValue(new Promise<void>((resolve) => { finishSync = resolve; }));
    const refresh = vi.fn(async () => undefined);

    await expect(insertDeclaredSkill("user", { name: row.name }, [], refresh)).resolves.toMatchObject({ id: row.id, name: row.name });
    expect(refresh).not.toHaveBeenCalled();
    finishSync();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });
});
