import {
  changeSavedHostSettings,
  type HostSettingsStore,
  type HostSettingValue,
  type HostSettingValues,
  isHostSettingKey,
} from "@halonicjs/ports";
import { canonicalJson, KindedError } from "@halonicjs/std";
import { hostSettingsCommands, isHostSettingsRefusal } from "./host-settings-commands.ts";
import type { TauriShell } from "./shell.ts";

/** How often a watch reads the settings again, in milliseconds, unless told otherwise. */
export const hostSettingsPollMs = 2000;

/** How a {@link TauriHostSettingsStore} watches; tests pass a shorter interval. */
export interface TauriHostSettingsStoreOptions {
  /** How often a watch reads the settings again, in milliseconds; {@link hostSettingsPollMs} by default. */
  readonly pollMs?: number;
}

/**
 * The settings kept where Halonic runs, for the Studio desktop app: every
 * call goes to one of the shell's `host_settings_*` commands, which keep
 * them in the profile's `settings/host.json`, the file the CLI's
 * `FileHostSettingsStore` reads and writes. The page never names a path.
 *
 * The shell has no file watch, so `watch` reads the settings again every
 * {@link hostSettingsPollMs} while anything watches, and calls its listener
 * only when they differ from what it last read. A save through this store
 * checks at once, so the page hears its own saves without waiting.
 */
export class TauriHostSettingsStore implements HostSettingsStore {
  readonly #shell: TauriShell;
  readonly #pollMs: number;
  /** The open watches' checks, so a save through this store runs them at once. */
  readonly #checks = new Set<() => void>();

  /** @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__` */
  constructor(shell: TauriShell, options: TauriHostSettingsStoreOptions = {}) {
    this.#shell = shell;
    this.#pollMs = options.pollMs ?? hostSettingsPollMs;
  }

  /** @throws Error when `host.json` can't be read, such as a link; `KindedError` `unavailable` when the shell can't be reached */
  async read(): Promise<HostSettingValues> {
    const answer = await this.#call(hostSettingsCommands.read, {});
    if (typeof answer !== "object" || answer === null || Array.isArray(answer)) {
      throw noAnswer();
    }
    return answer as HostSettingValues;
  }

  /**
   * The value is checked here first, with the port's own rules: IPC sends
   * JSON, which would turn a number that isn't finite into `null`, so the
   * shell could never refuse it. The shell checks the key and the size again.
   *
   * @throws RangeError when the key, a number or the size is refused; nothing is saved then
   */
  async set(key: string, value: HostSettingValue): Promise<void> {
    changeSavedHostSettings(undefined, key, value);
    await this.#call(hostSettingsCommands.set, { key, value });
    this.#checkWatches();
  }

  /** @throws RangeError when the key is refused; nothing is saved then */
  async remove(key: string): Promise<void> {
    if (!isHostSettingKey(key)) {
      throw new RangeError(`${JSON.stringify(key)} can't name a setting.`);
    }
    await this.#call(hostSettingsCommands.remove, { key });
    this.#checkWatches();
  }

  /**
   * The first read only sets the baseline, so a change that lands before it
   * answers isn't told: watch first, then read.
   */
  watch(listener: () => void): () => void {
    let stopped = false;
    /** Whether a read is under way, and whether another must follow it. */
    let checking = false;
    let again = false;
    /** The settings as last read, as canonical JSON, or `failed`; `undefined` before the first read. */
    let last: string | undefined;
    const readAndCompare = async (): Promise<void> => {
      let seen: string;
      try {
        seen = canonicalJson(await this.read());
      } catch {
        seen = "failed";
      }
      const changed = last !== undefined && seen !== last;
      last = seen;
      // A failed read is told once, as a change: the caller reads again and hears the error there.
      if (changed && !stopped) listener();
    };
    const check = (): void => {
      if (checking) {
        // A save landed while a read was under way, which may have missed it.
        again = true;
        return;
      }
      checking = true;
      void readAndCompare().finally(() => {
        checking = false;
        if (again && !stopped) {
          again = false;
          check();
        }
      });
    };
    check();
    const timer = setInterval(check, this.#pollMs);
    this.#checks.add(check);
    return () => {
      stopped = true;
      clearInterval(timer);
      this.#checks.delete(check);
    };
  }

  #checkWatches(): void {
    for (const check of this.#checks) check();
  }

  /** Runs one command, turning a refusal into the error the port asks for. */
  async #call(command: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.#shell.invoke(command, args);
    } catch (reason) {
      throw hostSettingsFailure(reason);
    }
  }
}

/**
 * The error a rejected `host_settings_*` command becomes. A refused key or
 * size is a `RangeError`, as the port asks; `host.json` that can't be read
 * is a plain `Error`, as `FileHostSettingsStore` throws it. Anything that
 * isn't the shell's refusal shape (a missing capability, a broken IPC call)
 * is `unavailable`, and its text is dropped: the adapter can't vouch for it.
 */
function hostSettingsFailure(reason: unknown): Error {
  if (!isHostSettingsRefusal(reason)) {
    return noAnswer();
  }
  switch (reason.kind) {
    case "invalid_key":
    case "too_large":
      return new RangeError(`The settings refused the save: ${reason.message}`);
    case "unreadable":
      return new Error(`The settings can't be read: ${reason.message}`, { cause: reason });
    case "io":
      return new KindedError("unavailable", `The settings refused the call: ${reason.message}`);
  }
}

function noAnswer(): KindedError {
  return new KindedError("unavailable", "The desktop shell gave no answer to the settings call.");
}
