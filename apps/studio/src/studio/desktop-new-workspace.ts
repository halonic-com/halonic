import { tauriChannelIpc } from "@halonicjs/studio-services";
import type { KeyboardPlatform } from "@halonicjs/studio-shell";
import { newWorkspaceHostOf } from "./new-workspace-host.ts";
import { shellFiles, workspaceTrustOf } from "./open-trusts.ts";
import { sampleHostOf } from "./sample-host.ts";

/**
 * The New workspace dialog's host (`studio.new-workspace`) and the sample's (`studio.try-sample`), over the shell's folder and file
 * commands. Without the channel the file commands need, the window has no New workspace row.
 *
 * @example
 * const { newWorkspace, sample } = newWorkspaceOf(page.window, "windows");
 */
export function newWorkspaceOf(window: object, platform: KeyboardPlatform) {
  const channelIpc = tauriChannelIpc(window);
  if (channelIpc === undefined) return {};
  const parts = {
    shell: shellFiles(channelIpc),
    separator: platform === "windows" ? ("\\" as const) : ("/" as const),
    trust: async (folder: string) => {
      const trust = workspaceTrustOf(channelIpc, folder);
      await trust.refresh();
      const check = trust.check;
      const fingerprint =
        check === undefined || check.status === "refused" ? undefined : check.fingerprint;
      if (fingerprint === undefined) throw new Error("Halonic couldn't read the new workspace");
      const granted = await trust.grant(fingerprint);
      if (!granted.ok) throw new Error(granted.reason);
    },
  };
  return { newWorkspace: newWorkspaceHostOf(parts), sample: sampleHostOf(parts) };
}
