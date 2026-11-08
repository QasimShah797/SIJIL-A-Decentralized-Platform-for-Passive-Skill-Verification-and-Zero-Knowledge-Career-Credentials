import { LearnerWorkspaceShell } from "@/components/sijil/LearnerWorkspaceShell";
import { SecureIdentityFlow, downloadRecoveryFile } from "@/components/identity/SecureIdentityFlow";
import { useSsiIdentity } from "@/hooks/useSsiIdentity";

export default function SecureIdentity() {
  const identity = useSsiIdentity();
  return (
    <LearnerWorkspaceShell variant="dashboard">
      <SecureIdentityFlow
        snapshot={identity.snapshot}
        loading={identity.loading}
        working={identity.working}
        recoverable={identity.recoverable}
        onActivate={async (passphrase) => {
          const result = await identity.activate(passphrase);
          return result.backup;
        }}
        onFinish={identity.finishRegistration}
        onUnlock={identity.unlock}
        onRestore={identity.restoreBackup}
        onDownload={downloadRecoveryFile}
        onExport={identity.exportBackup}
      />
    </LearnerWorkspaceShell>
  );
}
