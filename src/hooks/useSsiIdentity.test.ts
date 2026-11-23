import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSsiIdentity } from "./useSsiIdentity";
import { readSsiIdentityApi } from "@/services/api/ssi.api";
import { createPassphraseVault } from "@/lib/ssi/session";
import { activateLocalIdentity } from "@/lib/ssi/ownership";
import { SSI_IDENTITY_LOOKUP_ERROR } from "@/lib/ssi/onboarding";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "test-learner" } }) }));
vi.mock("@/services/api/ssi.api", () => ({
  readSsiIdentityApi: vi.fn(),
  createSsiChallengeApi: vi.fn(),
  bindSsiIdentityApi: vi.fn(),
}));
vi.mock("@/lib/ssi/support", () => ({
  evaluateSsiBrowserSupport: async () => ({ ok: true, nonExtractablePersist: true }),
}));
vi.mock("@/lib/ssi/keystore", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/ssi/keystore")>(),
  indexedDbKeyStore: { loadPersisted: vi.fn(async () => null), load: vi.fn(async () => null) },
}));
vi.mock("@/lib/ssi/session", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/ssi/session")>(),
  createPassphraseVault: vi.fn(),
}));
vi.mock("@/lib/ssi/ownership", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/ssi/ownership")>(),
  activateLocalIdentity: vi.fn(),
}));

describe("SSI server lookup", () => {
  it("distinguishes an empty binding from an outage and refuses both activation methods during the outage", async () => {
    const lookup = vi.mocked(readSsiIdentityApi);
    lookup.mockResolvedValue({
      did: null, fingerprint: null, boundAt: null, verificationMethod: null,
      tableReady: true, cryptographicallyBound: false,
    });
    const { result } = renderHook(() => useSsiIdentity());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.snapshot.server.did).toBeNull();
    expect(result.current.serverLookupFailed).toBe(false);

    lookup.mockRejectedValue(new Error("API unavailable"));
    await act(async () => {
      await expect(result.current.activate("test passphrase")).rejects.toThrow(SSI_IDENTITY_LOOKUP_ERROR);
    });
    await act(async () => {
      await expect(result.current.activate()).rejects.toThrow(SSI_IDENTITY_LOOKUP_ERROR);
    });
    expect(result.current.serverLookupFailed).toBe(true);
    expect(createPassphraseVault).not.toHaveBeenCalled();
    expect(activateLocalIdentity).not.toHaveBeenCalled();
  });
});
