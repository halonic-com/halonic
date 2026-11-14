import {
  TauriCommandPaths,
  TauriDefinitionStore,
  type TauriFileShell,
  TauriFolderReader,
  TauriTrustStore,
  webCryptoDigest,
} from "@halonicjs/adapter-fs-tauri";
import { TrustService } from "@halonicjs/app";
import { systemClock } from "@halonicjs/std";
import { type TauriCallbacks, TauriChannel, type TauriIpc } from "@halonicjs/studio-services";
import type { Shell } from "@halonicjs/studio-shell";
import { WorkspaceTrust } from "./workspace-trust.ts";

/** The shell's file commands and channels, as the desktop stores take them. */
export function shellFiles(ipc: TauriIpc & TauriCallbacks): TauriFileShell {
  return {
    invoke: (command, args) => ipc.invoke(command, args),
    openChannel: (onMessage) => new TauriChannel(ipc, onMessage),
  };
}

/** The trust of every folder open in a window, so removing a trusted source reaches all of them. */
const openTrusts = new WeakMap<Shell, Set<WorkspaceTrust>>();

export function openTrustsOf(shell: Shell): Set<WorkspaceTrust> {
  let open = openTrusts.get(shell);
  if (open === undefined) {
    open = new Set();
    openTrusts.set(shell, open);
  }
  return open;
}

/** The version written into the trust records the Studio saves, the one the CLI writes. */
const halonicVersion = "0.1.0";

/** The trust of the workspace in `location`, read through the shell as the CLI reads it. */
export function workspaceTrustOf(ipc: TauriIpc & TauriCallbacks, location: string): WorkspaceTrust {
  const commands = new TauriCommandPaths(ipc);
  return new WorkspaceTrust({
    definitions: new TauriDefinitionStore(shellFiles(ipc), location),
    folder: new TauriFolderReader(ipc, location),
    findCommand: async (command) => (await commands.find([command])).get(command),
    digest: webCryptoDigest,
    trust: new TrustService({
      store: new TauriTrustStore(ipc),
      digest: webCryptoDigest,
      clock: systemClock,
      appVersion: halonicVersion,
    }),
  });
}
