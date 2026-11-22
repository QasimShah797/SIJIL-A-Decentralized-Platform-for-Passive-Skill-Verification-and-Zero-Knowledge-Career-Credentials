import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { SecureIdentityFlow } from "./SecureIdentityFlow";
import type { SsiSnapshot } from "@/lib/ssi/ownership";
import type { EncryptedSsiBackup } from "@/lib/ssi/vault";

const support = {
  webCrypto: true,
  ed25519: true,
  indexedDb: true,
  nonExtractablePersist: true,
  ok: true,
  reasons: [],
};

function snapshot(status: SsiSnapshot["status"], serverDid: string | null): SsiSnapshot {
  return {
    status,
    local: serverDid || status === "active"
      ? { userId: "user-1", did: serverDid ?? "did:key:zLocal", fingerprint: "fp", createdAt: "2026-11-06T00:00:00.000Z" }
      : null,
    server: { did: serverDid, fingerprint: serverDid ? "fp" : null, boundAt: serverDid ? "2026-11-06T00:00:00.000Z" : null, tableReady: true },
    support,
    message: "",
  };
}

function renderFlow(props: Partial<ComponentProps<typeof SecureIdentityFlow>> = {}) {
  const onActivate = vi.fn(async () => null);
  const onFinish = vi.fn(async () => undefined);
  const onUnlock = vi.fn(async () => undefined);
  const onRestore = vi.fn(async () => undefined);
  const onDownload = vi.fn();
  const onExport = vi.fn(async () => {
    throw new Error("export was not expected");
  });
  render(
    <MemoryRouter>
      <SecureIdentityFlow
        snapshot={snapshot("not_activated", null)}
        loading={false}
        working={false}
        recoverable={false}
        onActivate={onActivate}
        onFinish={onFinish}
        onUnlock={onUnlock}
        onRestore={onRestore}
        onDownload={onDownload}
        onExport={onExport}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onActivate, onFinish, onUnlock, onRestore, onDownload, onExport };
}

describe("secure learning identity flow", () => {
  it("shows a retryable lookup failure instead of offering creation or linking", () => {
    const onRetryLookup = vi.fn(async () => undefined);
    const { onActivate, onFinish } = renderFlow({
      snapshot: snapshot("active", null),
      serverLookupFailed: true,
      onRetryLookup,
    });
    expect(screen.getByRole("alert")).toHaveTextContent("could not check the learning identity");
    expect(screen.queryByRole("button", { name: "Set up my secure identity" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Finish setup" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetryLookup).toHaveBeenCalledOnce();
    expect(onActivate).not.toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("does not create an identity before the learner confirms a protection choice", () => {
    const { onActivate } = renderFlow();
    expect(screen.getByRole("heading", { name: "Secure Identity" })).toBeInTheDocument();
    expect(screen.queryByText("In simple words")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Set up my secure identity" }));
    expect(screen.getByRole("heading", { name: "Save a recovery file" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "This browser only" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Set up my secure identity" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Recovery password", { exact: true })).toBeInTheDocument();
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("shows an existing identity as ready and does not offer another activation", () => {
    const { onActivate } = renderFlow({ snapshot: snapshot("active", "did:key:zBound"), recoverable: true });
    expect(screen.getByRole("heading", { name: "Your Secure Identity Is Ready!" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Set up my secure identity" })).toBeNull();
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("requires a matching recovery password before creating a recovery file", () => {
    const { onActivate } = renderFlow();
    fireEvent.click(screen.getByRole("button", { name: "Set up my secure identity" }));
    fireEvent.click(screen.getByRole("button", { name: "Create recovery file" }));
    expect(screen.getByRole("heading", { name: "Password tips" })).toBeInTheDocument();
    const recoveryPassword = screen.getByLabelText("Recovery password");
    expect(recoveryPassword).toHaveAttribute("type", "password");
    fireEvent.click(screen.getAllByRole("button", { name: "Show password" })[0]);
    expect(recoveryPassword).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Confirm recovery password")).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(recoveryPassword).toHaveAttribute("type", "password");
    fireEvent.change(screen.getByLabelText("Recovery password"), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText("Confirm recovery password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and continue" }));
    expect(screen.getByRole("alert").textContent).toMatch(/at least 10/);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("requires explicit acknowledgment before a browser-only identity", () => {
    const { onActivate } = renderFlow();
    fireEvent.click(screen.getByRole("button", { name: "Set up my secure identity" }));
    fireEvent.click(screen.getByRole("button", { name: "Use this browser only" }));
    expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByLabelText(/cannot restore a browser-only identity/));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onActivate).toHaveBeenCalledWith(undefined);
  });

  it("offers finish setup for an interrupted activation without creating a new key", () => {
    const { onActivate, onFinish } = renderFlow({ snapshot: snapshot("active", null) });
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(onFinish).toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("explains a wrong recovery password", async () => {
    const onUnlock = vi.fn(async () => {
      throw new Error("Incorrect passphrase");
    });
    renderFlow({ snapshot: snapshot("locked", "did:key:zBound"), onUnlock });
    const password = screen.getByLabelText("Recovery Password");
    expect(password).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Unlock Identity" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByText("More Information"));
    expect(screen.getByText("did:key:zBound")).toBeVisible();
    fireEvent.change(password, { target: { value: "long-enough-phrase" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock Identity" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot reset/);
    expect(onUnlock).toHaveBeenCalledWith("long-enough-phrase");
  });

  it("explains a missing local key and does not create a replacement", () => {
    const { onActivate } = renderFlow({ snapshot: snapshot("key_unavailable", "did:key:zBound"), recoverable: false });
    expect(screen.getByText(/A new identity will not be created/)).toBeTruthy();
    expect(screen.getByText(/browser-only identity cannot be restored/)).toBeTruthy();
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("explains a recovery file that belongs to another identity", async () => {
    const onRestore = vi.fn(async () => {
      throw new Error("This backup DID does not match the identity already bound");
    });
    renderFlow({ snapshot: snapshot("key_unavailable", "did:key:zBound"), onRestore });
    const contents = "{\"ciphertext\":\"abc\"}";
    const file = new File([contents], "sijil-learning-identity-recovery.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => contents });
    fireEvent.change(screen.getByLabelText("Choose Recovery File"), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText("Enter Recovery Password"), { target: { value: "long-enough-phrase" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Restore My Learning Identity" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("button", { name: "Restore My Learning Identity" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/was not replaced/);
    expect(onRestore).toHaveBeenCalled();
  });

  it("explains a temporarily unavailable server", async () => {
    const onFinish = vi.fn(async () => {
      throw new Error("SSI activation is temporarily unavailable");
    });
    renderFlow({ snapshot: snapshot("active", null), onFinish });
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/temporarily unavailable/);
  });

  it("keeps the loading message while status is refreshing", () => {
    renderFlow({ loading: true });
    expect(screen.getByText("Checking this device…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Set up my secure identity" })).toBeNull();
  });

  it("keeps the same encrypted backup when reviewing the previous step and requires a download before confirmation", async () => {
    const backup = {
      format: "SIJIL-SSI-VAULT-v1",
      userId: "user-1",
      did: "did:key:zBound",
      fingerprint: "fp",
      createdAt: "2026-11-06T00:00:00.000Z",
      wrap: { ciphertext: "abc" },
    } as unknown as EncryptedSsiBackup;
    const onActivate = vi.fn(async () => backup);
    const onDownload = vi.fn();
    renderFlow({ onActivate, onDownload });
    fireEvent.click(screen.getByRole("button", { name: "Set up my secure identity" }));
    fireEvent.click(screen.getByRole("button", { name: "Create recovery file" }));
    fireEvent.change(screen.getByLabelText("Recovery password"), { target: { value: "long-enough-phrase" } });
    fireEvent.change(screen.getByLabelText("Confirm recovery password"), { target: { value: "long-enough-phrase" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and continue" }));
    expect(await screen.findByRole("heading", { name: "Keep your identity safe" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /I have saved this file/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Recovery password is set" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Download recovery file" }));
    expect(onActivate).toHaveBeenCalledOnce();
    expect(onDownload).toHaveBeenCalledWith(backup);
    expect(JSON.stringify(onDownload.mock.calls[0][0])).not.toMatch(/BEGIN PRIVATE KEY|privateKey/);
    expect(screen.getByRole("checkbox", { name: /I have saved this file/ })).toBeEnabled();
  });

  it("offers the recovery file again after refresh when a vault is already on this device", async () => {
    const backup = {
      format: "SIJIL-SSI-VAULT-v1",
      userId: "user-1",
      did: "did:key:zBound",
      fingerprint: "fp",
      createdAt: "2026-11-06T00:00:00.000Z",
      wrap: { ciphertext: "abc" },
    } as unknown as EncryptedSsiBackup;
    const onExport = vi.fn(async () => backup);
    const onDownload = vi.fn();
    renderFlow({
      snapshot: snapshot("active", "did:key:zBound"),
      recoverable: true,
      onExport,
      onDownload,
    });
    fireEvent.click(screen.getByText("Advanced details"));
    const download = screen.getByRole("button", { name: "Download recovery file" });
    expect(download).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Recovery password"), { target: { value: "fixture-recovery-password" } });
    fireEvent.click(download);
    expect(onExport).toHaveBeenCalledWith("fixture-recovery-password");
    await waitFor(() => expect(onDownload).toHaveBeenCalledWith(backup));
  });

  it("hides recovery download controls for an existing locked vault", () => {
    const { onExport, onDownload } = renderFlow({
      snapshot: snapshot("locked", "did:key:zBound"),
      recoverable: true,
    });
    expect(screen.getByRole("button", { name: "Unlock Identity" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download recovery file" })).not.toBeInTheDocument();
    expect(onExport).not.toHaveBeenCalled();
    expect(onDownload).not.toHaveBeenCalled();
  });
});
