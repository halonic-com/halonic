/** Version of the {@link ConnectionSettingsStore} port. A breaking change bumps it and comes with an ADR. */
export const connectionSettingsStoreVersion = 1;

/** Which connector a setting is for. */
export interface ConnectionKey {
  /** The workspace's resolved real path, as in a `TrustRecord`. */
  location: string;
  /** The connector's id in the workspace. */
  connector: string;
}

/**
 * The settings a person chose for one connector (requirement
 * `ports.connection-settings-store`).
 *
 * @example
 * const settings: ConnectionSettingsRecord = {
 *   location: "/workspaces/acme",
 *   connector: "mail",
 *   allowSending: true,
 *   changedAt: "2026-11-09T10:00:00.000Z",
 * };
 */
export interface ConnectionSettingsRecord extends ConnectionKey {
  /**
   * Whether the connector's tools labelled `send` may run, such as sending
   * a mail. Without a record, sending is off.
   */
  allowSending: boolean;
  /** When the person last changed the settings, as ISO text. */
  changedAt: string;
}

/**
 * The settings of each connector, in the user's profile next to the trust
 * records: the profile folder for the CLI and `serve`, the app data folder
 * for the desktop app, memory for tests and the browser demo. **Never
 * inside a workspace**, so an agent that edits the workspace can't switch
 * sending on.
 *
 * The port only stores settings. `ConnectionSettings` in `core/app` reads
 * them, treats a missing record as sending off, and is what the engine and
 * the outside-a-run gate ask. Only a person changes them: no tool the model
 * can call reaches this store.
 *
 * A record that exists but can't be read makes `get` throw, never return
 * `null`: the caller then treats sending as off and tells the user why. The
 * error names the record's key, and `remove` still deletes it.
 */
export interface ConnectionSettingsStore {
  /** The settings for one connector, or `null` when there are none. */
  get(key: ConnectionKey): Promise<ConnectionSettingsRecord | null>;
  /** Saves settings, replacing any with the same key. */
  save(settings: ConnectionSettingsRecord): Promise<void>;
  /**
   * Deletes the settings for one connector, even ones that can't be read.
   * Removing settings that aren't there is not an error.
   */
  remove(key: ConnectionKey): Promise<void>;
}
