import { isPlainObject } from "@halonicjs/std";
import type { RiskySwitch } from "../gateway/remote-gateway.ts";
import type { PrivateFile } from "./private-file.ts";

/** The person's two remote switches, as Settings › Remote shows them. */
export interface RemoteSettingsValues {
  /** Whether remote is on. Phones stay paired while it is off. */
  readonly on: boolean;
  /** "Let phones answer risky approvals". */
  readonly allowRiskyRemotely: boolean;
}

/** Both switches off: the settings of a new profile, and of a file that can't be read. */
export const remoteSettingsOff: RemoteSettingsValues = { on: false, allowRiskyRemotely: false };

const fileVersion = 1;

/** What {@link RemoteSettings} runs on. */
export interface RemoteSettingsOptions {
  readonly file: PrivateFile;
  /** Where a file that can't be read is reported, before it counts as both switches off. */
  readonly log: (text: string) => void;
}

/**
 * The remote switches, kept in a small file in the profile (requirement
 * `agent-host.remote-settings`). Both are off unless the person turned them
 * on. A change takes effect in memory before it is written, so turning the
 * risky switch off holds at once even when the write fails; the gateway
 * reads it for every answer a phone sends.
 *
 * @example
 * const settings = await RemoteSettings.open({ file, log });
 * await settings.change({ allowRiskyRemotely: true });
 * new RemoteGateway(gatewaySettings, ledger, runs, settings);
 */
export class RemoteSettings implements RiskySwitch {
  readonly #file: PrivateFile;
  #values: RemoteSettingsValues;
  #saving: Promise<void> = Promise.resolve();

  private constructor(file: PrivateFile, values: RemoteSettingsValues) {
    this.#file = file;
    this.#values = values;
  }

  /** Reads the file; none, or one that can't be read, counts as both switches off. */
  static async open(options: RemoteSettingsOptions): Promise<RemoteSettings> {
    const text = await options.file.read();
    if (text === undefined) return new RemoteSettings(options.file, remoteSettingsOff);
    const values = readSettings(text);
    if (values === undefined) {
      options.log("The remote settings file can't be read, so remote and risky answers are off.\n");
      return new RemoteSettings(options.file, remoteSettingsOff);
    }
    return new RemoteSettings(options.file, values);
  }

  /** The switches as they are now. */
  get values(): RemoteSettingsValues {
    return this.#values;
  }

  allowRiskyRemotely(): boolean {
    return this.#values.allowRiskyRemotely;
  }

  /**
   * Changes the switches named and writes them; writes run one after another,
   * in order. Nothing is written when nothing changes.
   *
   * @throws what the file's write throws; the change still holds until the host stops
   */
  change(changes: Partial<RemoteSettingsValues>): Promise<void> {
    const values = { ...this.#values, ...changes };
    if (
      values.on === this.#values.on &&
      values.allowRiskyRemotely === this.#values.allowRiskyRemotely
    ) {
      return this.#saving;
    }
    this.#values = values;
    const text = `${JSON.stringify({ version: fileVersion, ...values }, null, 2)}\n`;
    const saved = this.#saving.then(() => this.#file.write(text));
    this.#saving = saved.catch(() => undefined);
    return saved;
  }
}

/** The switches in a file {@link RemoteSettings} wrote, or `undefined` for any other text. */
function readSettings(text: string): RemoteSettingsValues | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isPlainObject(parsed) || parsed["version"] !== fileVersion) return undefined;
  const { on, allowRiskyRemotely } = parsed;
  if (typeof on !== "boolean" || typeof allowRiskyRemotely !== "boolean") return undefined;
  return { on, allowRiskyRemotely };
}
