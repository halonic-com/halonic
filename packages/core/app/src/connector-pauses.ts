// The connectors paused because their code reached for a host their sheet
// doesn't list, or tried to send a secret where it may not (HAL-19188, from
// HAL-511 requirement 9). A pause belongs to the code it caught: it is kept
// by workspace, connector id and the hash of that code, so only a new code,
// which the person has to trust again, starts the connector again. Trusting
// the same code again doesn't.
//
// The pauses are records in the user's profile, apart from the trust record,
// whose format stays as it is. They are read where the trust is checked, in
// `TrustedRunnerStart`, and fail closed: pauses that can't be read start no
// connector at all.

import { BrokenRecordLogError, type Clock, foldRecords, type RecordStore } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";

/** The collection that holds the pauses, in a record store of their own in the profile. */
export const connectorPausesCollection = "connector-pauses";

/** What the runner caught the code doing. */
export type ConnectorPauseWhy =
  /** It sent a request to a host its permission sheet doesn't list. */
  | { readonly kind: "host-not-declared"; readonly host: string }
  /** The kit refused a request for a code on its leak list, such as `secret-in-request`. */
  | { readonly kind: "leak-attempt"; readonly code: string };

/** The connector and the code a pause is for. */
export interface ConnectorPauseKey {
  /** The workspace's resolved real path, the trust record's key. */
  readonly location: string;
  /** The connector's id, so another connector of the same integration folder runs on. */
  readonly connector: string;
  /** The hash of the integration's code it caught, as the trust content names it. */
  readonly code: string;
}

/** One paused connector. */
export interface ConnectorPause extends ConnectorPauseKey {
  readonly why: ConnectorPauseWhy;
  /** When it was paused, as ISO text. */
  readonly pausedAt: string;
}

/** A pause just made: it counts at once, and `saved` settles when it is in the store. */
export interface PauseMade {
  readonly pause: ConnectorPause;
  readonly saved: Promise<void>;
}

/**
 * Why a connector didn't start for a pause.
 *
 * - `connector-paused`: it is paused for the code it has now.
 * - `pause-unreadable`: the pauses can't be read, so it might be; it doesn't start.
 */
export type ConnectorPauseReason = "connector-paused" | "pause-unreadable";

/** A connector didn't start, or its call failed, because it is paused or its pauses can't be read. */
export class ConnectorPausedError extends Error {
  override readonly name = "ConnectorPausedError";
  readonly connector: string;
  readonly reason: ConnectorPauseReason;
  /** For `connector-paused`, the pause; otherwise `undefined`. */
  readonly pause: ConnectorPause | undefined;

  constructor(connector: string, reason: "connector-paused", pause: ConnectorPause);
  constructor(connector: string, reason: "pause-unreadable", place: string);
  constructor(connector: string, reason: ConnectorPauseReason, detail: ConnectorPause | string) {
    super(
      typeof detail === "string"
        ? `The paused connectors can't be read (${JSON.stringify(detail)}), so the connector ${JSON.stringify(connector)} doesn't start.`
        : `The connector ${JSON.stringify(connector)} is paused: ${pausedBecause(detail.why)}. It starts again once its code changes and the workspace is trusted again.`,
    );
    this.connector = connector;
    this.reason = reason;
    this.pause = typeof detail === "string" ? undefined : detail;
  }
}

/** What {@link ConnectorPauses} needs from the host. */
export interface ConnectorPausesOptions {
  /** The store that holds only the pauses, in the user's profile: never inside a workspace. */
  readonly records: RecordStore;
  /** Where the store keeps them, such as `<profile>/connector-pauses`, so a refusal names it. */
  readonly place: string;
  readonly clock: Clock;
}

/**
 * The paused connectors of every workspace.
 *
 * A pause is noted in memory at once and then saved, so a start in the same
 * tick already finds it, and so does every start in this process even when
 * the save fails. Writes go one at a time, and a read waits for the writes
 * before it, so it never reads the store from before a pause or a removal.
 *
 * @example
 * const pauses = new ConnectorPauses({ records, place, clock });
 * pauses.pause({ location, connector: "notes", code }, { kind: "host-not-declared", host: "undeclared.example.net" });
 * (await pauses.find({ location, connector: "notes", code }))?.why; // the host block
 */
export class ConnectorPauses {
  readonly #records: RecordStore;
  readonly #place: string;
  readonly #clock: Clock;
  /** The pauses this process made, by record id, kept whether or not their save worked. */
  readonly #noted = new Map<string, ConnectorPause>();
  /** The last write, so the next write and every read come after it. */
  #writes: Promise<void> = Promise.resolve();

  constructor(options: ConnectorPausesOptions) {
    this.#records = options.records;
    this.#place = options.place;
    this.#clock = options.clock;
  }

  /**
   * Pauses the connector for its code `key.code`. It counts from the moment
   * this is called, for every start in this process, even if the save fails.
   */
  pause(key: ConnectorPauseKey, why: ConnectorPauseWhy): PauseMade {
    const pause: ConnectorPause = { ...key, why, pausedAt: this.#clock.now().toISOString() };
    const id = recordId(key);
    this.#noted.set(id, pause);
    const saved = this.#write(async () => {
      const at = pause.pausedAt;
      await this.#records.append([
        { at, collection: connectorPausesCollection, id, op: "add", values: { ...pause } },
      ]);
    });
    return { pause, saved };
  }

  /**
   * The pause of the connector for this code, or `undefined` when it isn't paused.
   *
   * @throws ConnectorPausedError with `pause-unreadable` when the pauses can't be read
   */
  async find(key: ConnectorPauseKey): Promise<ConnectorPause | undefined> {
    const noted = this.#noted.get(recordId(key));
    if (noted !== undefined) return noted;
    await this.#writes;
    return (await this.#read(key.connector)).get(recordId(key));
  }

  /** Settles once every pause and removal made so far is saved, or failed to be. */
  async saved(): Promise<void> {
    await this.#writes;
  }

  /**
   * Lifts every pause of a connector of a workspace, whatever code it caught,
   * for the person's "Remove it". Removing one that isn't paused is not an error.
   *
   * @throws ConnectorPausedError with `pause-unreadable` when the pauses can't be read
   */
  remove(location: string, connector: string): Promise<void> {
    const isIt = (pause: ConnectorPauseKey) =>
      pause.location === location && pause.connector === connector;
    for (const [id, pause] of this.#noted) {
      if (isIt(pause)) this.#noted.delete(id);
    }
    return this.#write(async () => {
      const at = this.#clock.now().toISOString();
      const ids = [...(await this.#read(connector))].filter(([, pause]) => isIt(pause));
      await this.#records.append(
        ids.map(([id]) => ({
          at,
          collection: connectorPausesCollection,
          id,
          op: "remove" as const,
          values: null,
        })),
      );
    });
  }

  /** Runs `write` after every write before it; a failed write doesn't stop the next. */
  #write(write: () => Promise<void>): Promise<void> {
    const done = this.#writes.then(write);
    this.#writes = done.catch(() => undefined);
    return done;
  }

  /**
   * Every saved pause by record id. Any record that isn't exactly a pause
   * under its own id makes them all unreadable, so a hand edit can't lift one.
   */
  async #read(connector: string): Promise<Map<string, ConnectorPause>> {
    let records: ReturnType<typeof foldRecords>;
    try {
      records = foldRecords(await this.#records.changes(connectorPausesCollection));
    } catch (error) {
      const place = error instanceof BrokenRecordLogError ? error.file : this.#place;
      throw new ConnectorPausedError(connector, "pause-unreadable", place);
    }
    const pauses = new Map<string, ConnectorPause>();
    for (const [id, { values }] of records) {
      if (!isConnectorPause(values) || recordId(values) !== id) {
        throw new ConnectorPausedError(connector, "pause-unreadable", this.#place);
      }
      pauses.set(id, values);
    }
    return pauses;
  }
}

/** A pause's record id: its key as JSON, so a location ending in `"` can't run into the connector id. */
function recordId(key: ConnectorPauseKey): string {
  return JSON.stringify([key.location, key.connector, key.code]);
}

function isConnectorPause(value: unknown): value is ConnectorPause {
  if (!isPlainObject(value)) return false;
  const { location, connector, code, why, pausedAt } = value;
  const texts = [location, connector, code, pausedAt];
  return texts.every((text) => typeof text === "string") && isPauseWhy(why);
}

function isPauseWhy(value: unknown): value is ConnectorPauseWhy {
  if (!isPlainObject(value)) return false;
  if (value["kind"] === "host-not-declared") return typeof value["host"] === "string";
  return value["kind"] === "leak-attempt" && typeof value["code"] === "string";
}

function pausedBecause(why: ConnectorPauseWhy): string {
  return why.kind === "host-not-declared"
    ? `its code sent a request to ${why.host}, which its permission sheet doesn't list`
    : `the kit refused a request of its code (${why.code})`;
}
