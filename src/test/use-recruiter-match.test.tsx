import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const invoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

import { useRecruiterMatch } from "@/hooks/useRecruiterMatch";

describe("useRecruiterMatch", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("stores a validated answer", async () => {
    invoke.mockResolvedValue({
      data: {
        intent: "find",
        headline: "Aaiza shared Java.",
        candidates: [{ id: "a1", rank: 1, verdict: "Java is shared.", strengths: ["Java"], gaps: [], basis: { credentials: 1, evidence: 2, verifiedEvidence: 1 } }],
        comparison: null,
        notDisclosed: [],
        followUps: [],
      },
      error: null,
    });
    const { result } = renderHook(() => useRecruiterMatch());
    await act(async () => {
      await result.current.ask("who shared java", { allowedIds: ["a1"] });
    });
    expect(result.current.status).toBe("success");
    expect(result.current.data?.headline).toBe("Aaiza shared Java.");
  });

  it("ignores a slower answer after a newer question", async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    invoke
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({
        data: {
          intent: "find",
          headline: "Second answer.",
          candidates: [],
          comparison: null,
          notDisclosed: [],
          followUps: [],
        },
        error: null,
      });
    const { result } = renderHook(() => useRecruiterMatch());
    await act(async () => {
      void result.current.ask("first");
      await result.current.ask("second");
      resolveFirst({
        data: { intent: "find", headline: "First answer.", candidates: [], notDisclosed: [], followUps: [] },
        error: null,
      });
    });
    expect(result.current.data?.headline).toBe("Second answer.");
  });
});
