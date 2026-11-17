import type { TauriIpc } from "@halonicjs/studio-services";
import type { WslBackupShell } from "./agent-sandbox-host.ts";

/**
 * The shell's part of removing the WSL setup, when it offers the removal (Windows, host beside the
 * shell); `undefined` otherwise, so the section shows no **Remove sandbox setup**.
 */
export async function wslBackupOf(ipc: TauriIpc): Promise<WslBackupShell | undefined> {
  const offered = await ipc.invoke("wsl_removal_offered").catch(() => false);
  if (offered !== true) return undefined;
  return {
    choose: async (suggestedName) => {
      const chosen = await ipc.invoke("wsl_backup_choose", { suggested: suggestedName });
      return typeof chosen === "string" ? chosen : null;
    },
    reveal: async () => {
      await ipc.invoke("wsl_backup_reveal");
    },
  };
}
