// The settings a person chose for each connector, as `app.connection-settings`
// asks. The engine asks it at its side-effect boundary, and the outside-a-run
// gate asks it for calls from chat. Sending is off unless a person switched
// it on for that connector.

import type { Clock, ConnectionKey, ConnectionSettingsStore } from "@halonicjs/ports";
import { escapeListedText } from "./listed-tool-rules.ts";

/** Whether a connector may run its tools labelled `send`. */
export type SendingCheck =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      /**
       * Why not, as plain text that may go back to the model as the call's
       * result. It names the connector, and never repeats a store error.
       */
      readonly reason: string;
      /**
       * The store's error when the settings couldn't be read, for the host
       * to log and show the person. Never give it to the model: it can name
       * paths in the user's profile.
       */
      readonly error?: unknown;
    };

/**
 * The read side of {@link ConnectionSettings}: what the engine and the
 * outside-a-run gate get. It has no way to change a setting, so nothing on
 * a tool call's path can switch sending on.
 */
export interface SendingSettings {
  /** Whether the connector may send. Without settings, or with unreadable ones, it may not. */
  checkSending(key: ConnectionKey): Promise<SendingCheck>;
}

/** What {@link ConnectionSettings} needs from the host. */
export interface ConnectionSettingsOptions {
  /** The settings in the user's profile. */
  readonly store: ConnectionSettingsStore;
  /** Gives the time a person changed a setting. */
  readonly clock: Clock;
}

/**
 * Reads and changes the settings of each connector. Only a person changes
 * them, through the Library's "Allow sending" switch or `halonic google`.
 * Hand the engine and every tool call's path only the
 * {@link SendingSettings} side.
 *
 * @example
 * const settings = new ConnectionSettings({ store, clock });
 * const sending = await settings.checkSending({ location: "/workspaces/acme", connector: "mail" });
 * if (!sending.allowed) return refuse(sending.reason);
 */
export class ConnectionSettings implements SendingSettings {
  private readonly store: ConnectionSettingsStore;
  private readonly clock: Clock;

  constructor(options: ConnectionSettingsOptions) {
    this.store = options.store;
    this.clock = options.clock;
  }

  /**
   * Whether the connector may send. Without settings, sending is off.
   * Settings that can't be read count as off too, and the result carries
   * the error, so the host can tell the person why.
   */
  async checkSending(key: ConnectionKey): Promise<SendingCheck> {
    const connector = `"${escapeListedText(key.connector)}"`;
    try {
      const settings = await this.store.get(key);
      if (settings?.allowSending === true) {
        return { allowed: true };
      }
      return { allowed: false, reason: `sending is off for the connector ${connector}` };
    } catch (error) {
      return {
        allowed: false,
        reason: `the settings of the connector ${connector} can't be read, so sending is off`,
        error,
      };
    }
  }

  /**
   * Switches sending on or off for one connector, as a person chose. It
   * replaces settings that couldn't be read, so this is also how a person
   * recovers from them.
   *
   * Only a person's own action calls this. No tool offers it, and nothing a
   * tool call can reach holds it: the engine and the outside-a-run gate get
   * only {@link SendingSettings}, which a test pins.
   */
  async setAllowSending(key: ConnectionKey, allowed: boolean): Promise<void> {
    await this.store.save({
      location: key.location,
      connector: key.connector,
      allowSending: allowed,
      changedAt: this.clock.now().toISOString(),
    });
  }
}
