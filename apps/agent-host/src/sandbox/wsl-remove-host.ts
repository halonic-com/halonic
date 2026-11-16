import { join } from "node:path";
import {
  makePrivateFolder,
  readUnlinkedFile,
  renameOver,
  writeFlushedFile,
} from "@halonicjs/adapter-fs-node";
import {
  HALONIC_DISTRO,
  removeWslSetup,
  systemWslRemoveHost,
  type WslRemoveChoice,
  type WslRemoveHost,
  type WslRemoveResult,
  type WslSetupState,
  type WslSetupStore,
  wslSetupSteps,
} from "@halonicjs/adapter-sandbox-srt";

/** Same folder as the sandbox choice: the profile's `sandbox` folder, which no workspace can reach. */
const folderName = "sandbox";
const fileName = "wsl-setup.json";

/** Whether `value` is a saved WSL setup state; a hand edit may have put anything in the file. */
function isState(value: unknown): value is WslSetupState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  if (!wslSetupSteps.includes(state["step"] as never)) return false;
  const imported = state["importedDistro"];
  if (imported === undefined) return true;
  if (typeof imported !== "object" || imported === null) return false;
  const distro = imported as Record<string, unknown>;
  return typeof distro["name"] === "string" && typeof distro["location"] === "string";
}

/**
 * The saved state of the WSL setup as one JSON file in the profile's
 * `sandbox` folder. A save writes a temporary file and renames it over the
 * state, like the sandbox choice, and a link in place of the file is refused.
 * A file that can't be read is an error, never "not started": the removal
 * must not take a damaged state for an empty one.
 */
export function fileWslSetupStore(profileFolder: string): WslSetupStore {
  const folder = join(profileFolder, folderName);
  const file = join(folder, fileName);
  return {
    async load() {
      let text: string;
      try {
        text = await readUnlinkedFile(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { step: "not-started" };
        throw new Error("The saved WSL setup state can't be read.", { cause: error });
      }
      let state: unknown;
      try {
        state = JSON.parse(text);
      } catch (error) {
        throw new Error("The saved WSL setup state can't be read.", { cause: error });
      }
      if (!isState(state)) throw new Error("The saved WSL setup state isn't a valid state.");
      return state;
    },
    async save(state) {
      await makePrivateFolder(folder);
      const temporary = `${file}.${process.pid}.tmp`;
      await writeFlushedFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      await renameOver(temporary, file);
    },
  };
}

/** Removes Halonic's WSL distro after an explicit choice (HAL-10974). */
export type WslRemover = (choice: WslRemoveChoice) => Promise<WslRemoveResult>;

/**
 * The remover of this host: the real `wsl.exe` and the state saved in the
 * profile. Nothing about the distro comes from the caller: it is always
 * Halonic's own, and `removeWslSetup` refuses it unless Halonic imported it.
 *
 * @param host - `wsl.exe` on this machine; tests hand a fake one
 */
export function hostWslRemover(
  profileFolder: string,
  host: WslRemoveHost = systemWslRemoveHost(),
): WslRemover {
  const store = fileWslSetupStore(profileFolder);
  return (choice) => removeWslSetup(host, store, HALONIC_DISTRO, choice);
}
