// The person's choice to continue without a sandbox (HAL-3779 design,
// section 7). Only a person makes it, in Studio or the app: the CLI reads
// it and never saves it.

import type { Clock, SandboxSetting, SandboxSettingStore } from "@halonicjs/ports";

/** What {@link NoSandboxService} needs from the host. */
export interface NoSandboxOptions {
  /** Where the person's sandbox choice is saved. */
  settings: Pick<SandboxSettingStore, "get" | "save" | "remove">;
  /** Stamps the choice. */
  clock: Clock;
  /** The Halonic version that is running, saved with the choice. */
  appVersion: string;
}

/**
 * Whether a CLI run may go without a sandbox: only when the saved setting
 * already says `none`. `not-chosen` means the person hasn't made that
 * choice, so the run is refused.
 */
export type NoSandboxFlagDecision = { allowed: true } | { allowed: false; reason: "not-chosen" };

/**
 * Makes and takes back the "no sandbox" choice (requirement
 * `app.no-sandbox`). `choose` is for a person's click in Studio or the
 * app. No command line or model tool calls it.
 *
 * @example
 * const noSandbox = new NoSandboxService({ settings, clock, appVersion: "0.1.0" });
 * await noSandbox.choose(); // saves { backend: "none", chosenAt, appVersion: "0.1.0" }
 * await noSandbox.takeBack(); // back to "not chosen yet"
 */
export class NoSandboxService {
  readonly #options: NoSandboxOptions;

  constructor(options: NoSandboxOptions) {
    this.#options = options;
  }

  /** Saves `none` with the time and the app version, replacing any choice before. */
  async choose(): Promise<SandboxSetting> {
    const setting: SandboxSetting = {
      backend: "none",
      chosenAt: this.#options.clock.now().toISOString(),
      appVersion: this.#options.appVersion,
    };
    await this.#options.settings.save(setting);
    return setting;
  }

  /** Deletes the choice, so the person is asked again. Without a choice it does nothing. */
  async takeBack(): Promise<void> {
    await this.#options.settings.remove();
  }

  /**
   * Decides a CLI `--no-sandbox`: allowed only when the saved setting
   * already says `none`. It never saves anything.
   *
   * @throws when the saved setting can't be read
   */
  async cliFlag(): Promise<NoSandboxFlagDecision> {
    const setting = await this.#options.settings.get();
    return setting?.backend === "none"
      ? { allowed: true }
      : { allowed: false, reason: "not-chosen" };
  }
}
