// The yes to run local integrations without the sandbox, as the `halonic`
// command reads it (HAL-15144, Liam's conditions on the plan): the file
// Studio's agent host saves in the profile's `unfenced-runs` folder, so
// Studio and the command never disagree on whether there is a yes. There is
// no check for Studio's install: on a computer without Studio nobody can give
// the yes, so integrations run only in the sandbox there (R19). Whoever can
// write the profile can already write trust records, so a yes written by
// hand is no wider an exposure than that (threat model).
//
// The command only reads the yes. Only Studio's agent host gives it or takes
// it back; there is no flag for it.

import { FileUnfencedRunConsentStore } from "@halonicjs/adapter-fs-node";
import type {
  SandboxSettingStore,
  UnfencedRunConsent,
  UnfencedRunConsentStore,
} from "@halonicjs/ports";

/**
 * The profile's saved yes, read-only. `save` throws. `remove` passes
 * through, because the start gate removes the yes once the computer passes
 * the sandbox check, so a later failure asks again (`app.unfenced-runs`):
 * it only ever takes a yes away, never gives one.
 *
 * It also remembers whether the last read failed, so a start that answers
 * `needs-yes` because the file is broken can say which file.
 *
 * @example
 * const saved = new SavedUnfencedYes(unfencedRunsFolder(profile));
 * const runs = new UnfencedRuns({ store: saved, clock, timers });
 */
export class SavedUnfencedYes implements UnfencedRunConsentStore {
  readonly #store: FileUnfencedRunConsentStore;
  #lastReadFailed = false;

  /** @param folder - the profile's `unfenced-runs` folder, the one the agent host writes */
  constructor(folder: string) {
    this.#store = new FileUnfencedRunConsentStore(folder);
  }

  /** The file that holds the yes. */
  get file(): string {
    return this.#store.file;
  }

  /** The file, when the last read of the yes failed: bad JSON, extra fields, a date that won't parse, a link. */
  get unreadableFile(): string | undefined {
    return this.#lastReadFailed ? this.#store.file : undefined;
  }

  async get(): Promise<UnfencedRunConsent | null> {
    try {
      const saved = await this.#store.get();
      this.#lastReadFailed = false;
      return saved;
    } catch (error) {
      this.#lastReadFailed = true;
      throw error;
    }
  }

  async save(_consent: UnfencedRunConsent): Promise<never> {
    throw new Error(
      "the halonic command never saves a yes to run without the sandbox; only Studio gives it",
    );
  }

  async remove(): Promise<void> {
    await this.#store.remove();
  }
}

/**
 * Whether a yes given in Studio reaches the command, read from the saved
 * sandbox choice at each refusal. On Windows with the WSL choice, or with
 * none (WSL is the default there), Studio's agent host runs in Halonic's WSL
 * distro with its own profile, so the command never sees its yes (the shell's
 * `host_for`). A choice that can't be read counts as not reaching, so the
 * refusal never sends the person to Studio for a yes the command can't see.
 *
 * @example
 * await studioYesReaches("win32", { get: async () => null }); // false
 * await studioYesReaches("linux", { get: async () => null }); // true
 */
export async function studioYesReaches(
  platform: string,
  settings: Pick<SandboxSettingStore, "get">,
): Promise<boolean> {
  if (platform !== "win32") return true;
  try {
    const setting = await settings.get();
    return setting !== null && setting.backend !== "srt-wsl";
  } catch {
    return false;
  }
}
