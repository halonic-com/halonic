// "Remove sandbox setup" for the `srt-wsl` backend (HAL-5402, W12): the one
// place that may unregister the distro. It does so only after an explicit
// choice, with an export offered first, and only for the distro Halonic
// imported itself (W8).

import type { ProgramResult, WslDistro } from "./host.ts";
import type { WslSetupStore } from "./state.ts";

/** What removing the setup asks of the machine. A test hands it a fake one. */
export interface WslRemoveHost {
  /** The registered distros, or an empty list when WSL can't list them. */
  distros(): Promise<WslDistro[]>;
  /** `wsl --export <name> <file>`: a backup of the distro's files. */
  exportDistro(name: string, file: string): Promise<ProgramResult>;
  /** `wsl --unregister <name>`: deletes the distro and all its files. */
  unregisterDistro(name: string): Promise<ProgramResult>;
}

/**
 * What the user chose for the distro's files. There is no default: the
 * caller has to put one of these in front of the user.
 *
 * - `keep`: leave the distro alone.
 * - `export-then-remove`: write a backup to `file`, then remove.
 * - `remove-without-export`: the user was offered the backup and turned it down.
 */
export type WslRemoveChoice =
  | { choice: "keep" }
  | { choice: "export-then-remove"; file: string }
  | { choice: "remove-without-export" };

/**
 * - `kept`: nothing was changed.
 * - `removed`: the distro is gone and the saved setup state is reset.
 * - `refused`: nothing was changed; `reason` says why.
 * - `failed`: a step ended with an error; `unregistered` says whether the distro is still there.
 */
export type WslRemoveResult =
  | { outcome: "kept" }
  | { outcome: "removed"; exportedTo?: string }
  | { outcome: "refused"; reason: "distro-not-ours" | "distro-missing" | "bad-export-file" }
  | { outcome: "failed"; reason: "export-failed" | "unregister-failed"; detail: string };

/** A Windows path to a file, so the export can't go to a share, a device or a relative path. */
const exportFile = /^[A-Za-z]:\\(?:[^\\/:*?"<>|\0]+\\)*[^\\/:*?"<>|\0]+$/;

/**
 * Removes the distro of the setup, never without an explicit choice and never
 * without an export having been offered: the caller can't build a removal
 * without saying whether the backup was taken or declined. When a backup is
 * asked for and it fails, the distro stays.
 *
 * @example
 * await removeWslSetup(host, store, "halonic", { choice: "remove-without-export" });
 */
export async function removeWslSetup(
  host: WslRemoveHost,
  store: WslSetupStore,
  distro: string,
  choice: WslRemoveChoice,
): Promise<WslRemoveResult> {
  if (choice.choice === "keep") return { outcome: "kept" };
  const state = await store.load();
  // W8: the distro Halonic imported is the only one it will ever delete.
  if (state.importedDistro?.name !== distro)
    return { outcome: "refused", reason: "distro-not-ours" };
  const registered = (await host.distros()).some((d) => d.name === distro);
  if (!registered) return { outcome: "refused", reason: "distro-missing" };
  if (choice.choice === "export-then-remove" && !exportFile.test(choice.file))
    return { outcome: "refused", reason: "bad-export-file" };

  if (choice.choice === "export-then-remove") {
    const exported = await host.exportDistro(distro, choice.file);
    if (exported.code !== 0)
      return {
        outcome: "failed",
        reason: "export-failed",
        detail: `wsl --export ended with ${exported.code ?? "no start"}`,
      };
  }
  const gone = await host.unregisterDistro(distro);
  if (gone.code !== 0)
    return {
      outcome: "failed",
      reason: "unregister-failed",
      detail: `wsl --unregister ended with ${gone.code ?? "no start"}`,
    };
  await store.save({ step: "not-started" });
  return choice.choice === "export-then-remove"
    ? { outcome: "removed", exportedTo: choice.file }
    : { outcome: "removed" };
}
