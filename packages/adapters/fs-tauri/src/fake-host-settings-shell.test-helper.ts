import { changeSavedHostSettings, readSavedHostSettings } from "@halonicjs/ports";
import type { ShellCall } from "./fake-shell.test-helper.ts";
import type { HostSettingsRefusal, HostSettingsRefusalKind } from "./host-settings-commands.ts";
import type { TauriShell } from "./shell.ts";

/**
 * A shell that answers the `host_settings_*` commands as the Rust shell
 * does (`crates/host-settings`): the settings kept as the text of one
 * `host.json`, read and changed with the port's own functions, which the
 * Rust side matches through the same golden cases, a text that can't be
 * parsed kept as a broken copy on the first save, and settings that would
 * be too large answered as the shell's refusal. Arguments go through JSON, as Tauri's
 * IPC sends them, so `NaN` arrives as `null`.
 *
 * Every call is kept in `calls`.
 */
export class FakeHostSettingsShell implements TauriShell {
  readonly calls: ShellCall[] = [];
  /** `host.json`'s text; `undefined` when none is saved. */
  text: string | undefined;
  /** `host.json.broken`'s text; `undefined` when there is none. */
  broken: string | undefined;
  readonly #granted: boolean;
  #nextRefusal: HostSettingsRefusalKind | undefined;

  /** @param options.granted - whether the page has the `desktop-host-settings` capability; the served Studio doesn't */
  constructor(options: { granted?: boolean } = {}) {
    this.#granted = options.granted ?? true;
  }

  /** Makes the next call fail this way, before anything is read or written. */
  refuseNext(kind: HostSettingsRefusalKind): void {
    this.#nextRefusal = kind;
  }

  async invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
    const sent: Record<string, unknown> = JSON.parse(JSON.stringify({ ...args }));
    this.calls.push({ command, args: sent });
    if (!this.#granted) {
      // What Tauri rejects with for a command the capability doesn't allow: text, not a refusal.
      throw `Command ${command} not allowed by ACL`;
    }
    if (this.#nextRefusal !== undefined) {
      const kind = this.#nextRefusal;
      this.#nextRefusal = undefined;
      throw refusal(kind, `refused by the test (${kind})`);
    }
    if (command === "host_settings_read") {
      return (this.text === undefined ? undefined : readSavedHostSettings(this.text)) ?? {};
    }
    // `host_settings_set` or `host_settings_remove`, which sends no value.
    return this.#save(String(sent["key"]), sent["value"]);
  }

  #save(key: string, value: unknown): null {
    let change: ReturnType<typeof changeSavedHostSettings>;
    try {
      change = changeSavedHostSettings(this.text, key, value as never);
    } catch (error) {
      // The adapter checks the key and the value's own size first, so only
      // the size with the other saved keys gets this far.
      throw refusal("too_large", (error as Error).message);
    }
    if (change.broken) this.broken = this.text;
    this.text = change.text;
    return null;
  }
}

function refusal(kind: HostSettingsRefusalKind, message: string): HostSettingsRefusal {
  return { kind, message };
}
