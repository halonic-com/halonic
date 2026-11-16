// The person's choice to continue without a sandbox (HAL-3779 design,
// section 7). Only a person makes it, in Studio or the app. There is no
// command line flag for it.

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
 * Makes and takes back the "no sandbox" choice (requirement
 * `app.no-sandbox`). `choose` is for a person's click in Studio or the
 * app. No command line or model tool calls it, and there is no flag to
 * run without the sandbox.
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

  /**
   * Deletes the choice `none`, so the person is asked again. Without that
   * choice it does nothing: a saved backend such as `srt` is kept.
   */
  async takeBack(): Promise<void> {
    const setting = await this.#options.settings.get();
    if (setting?.backend === "none") await this.#options.settings.remove();
  }
}
