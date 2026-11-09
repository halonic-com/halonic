// Decides whether a workspace is trusted, as `app.trust-service` asks: it
// builds the trust content, fingerprints it and compares it with the trust
// record in the user's profile. Only a person adds to a record (HAL-571);
// a change that only removes whole connectors shrinks it (HAL-65 decision 9).

import type { Connector } from "@halonicjs/format";
import type {
  Clock,
  Digest,
  TrustGrant,
  TrustOrigin,
  TrustRecord,
  TrustStore,
} from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";
import {
  type TrustChanges,
  type TrustContent,
  trustChanges,
  trustContent,
  trustFingerprint,
} from "@halonicjs/workspace";

/** The workspace a trust check is about. */
export interface TrustSubject {
  /** The workspace's resolved real path: the trust record's key. */
  readonly location: string;
  /** The workspace's connectors, as parsed from their files. */
  readonly connectors: readonly Connector[];
  /**
   * The absolute path each program command resolves to on this machine,
   * by command as written. Required, so the resolved command is always in
   * the fingerprint (HAL-1921 review).
   */
  readonly commandPaths: ReadonlyMap<string, string>;
}

/** What the workspace holds now, as the prompt shows it. */
interface CurrentTrust {
  readonly content: TrustContent;
  /** The full fingerprint, such as "hfp1:9f86d081…". Never shortened. */
  readonly fingerprint: string;
}

/** Whether a workspace is trusted, and if not, why. */
export type TrustCheck =
  | (CurrentTrust & {
      readonly status: "trusted";
      readonly grant: TrustGrant;
      /** The connectors the record lost because they were removed, by id. Empty when nothing was. */
      readonly shrunk: readonly string[];
    })
  | (CurrentTrust & { readonly status: "new" })
  | (CurrentTrust & {
      readonly status: "changed";
      readonly changes: TrustChanges;
      /** When the person trusted the earlier version, as ISO text. */
      readonly trustedAt: string;
    })
  | (CurrentTrust & {
      readonly status: "unreadable";
      /** The store's error. It names the record's location, so the host can say which file. */
      readonly error: unknown;
    });

/** Why a person's trust wasn't saved. */
export interface TrustRefusal {
  readonly kind: "fingerprint-changed";
  /** The current full fingerprint, to show the person again. */
  readonly fingerprint: string;
}

/** How a person trusted a workspace. A migration doesn't go through the service. */
export type PersonTrustOrigin = Exclude<TrustOrigin, "migration">;

/** What {@link TrustService} needs from the host. */
export interface TrustServiceOptions {
  /** The trust records in the user's profile. */
  readonly store: TrustStore;
  /** Hashes the trust content. */
  readonly digest: Digest;
  /** Gives the time a person trusted a workspace. */
  readonly clock: Clock;
  /** The version of Halonic, written into each record. */
  readonly appVersion: string;
}

/**
 * Checks and keeps the trust of workspaces. The launcher gets a
 * {@link TrustGrant} only from {@link TrustService.check}.
 *
 * There is no method that updates a record without the fingerprint a person
 * was shown: saving a workspace in the Studio never trusts it (HAL-571).
 * Only a person's own action calls {@link TrustService.grant}; it isn't on
 * the command bus.
 *
 * @example
 * const trust = new TrustService({ store, digest, clock, appVersion: "0.1.0" });
 * const check = await trust.check({ location, connectors, commandPaths });
 * if (check.status !== "trusted") return refuse(check.fingerprint); // exit code 3
 */
export class TrustService {
  private readonly store: TrustStore;
  private readonly digest: Digest;
  private readonly clock: Clock;
  private readonly appVersion: string;

  constructor(options: TrustServiceOptions) {
    this.store = options.store;
    this.digest = options.digest;
    this.clock = options.clock;
    this.appVersion = options.appVersion;
  }

  /**
   * Whether the workspace is trusted now. A change that only removes whole
   * connectors shrinks the record and counts as trusted, without asking.
   *
   * @throws when shrinking the record can't be saved
   */
  async check(subject: TrustSubject): Promise<TrustCheck> {
    const current = await this.current(subject);
    let record: TrustRecord | null;
    try {
      record = await this.store.get(subject.location);
    } catch (error) {
      return { status: "unreadable", ...current, error };
    }
    if (record === null) {
      return { status: "new", ...current };
    }
    if (record.fingerprint === current.fingerprint) {
      return { status: "trusted", ...current, grant: grantOf(record), shrunk: [] };
    }

    const trusted = await this.trustedContent(record);
    const changes = trustChanges(trusted ?? { connectors: [] }, current.content);
    if (trusted !== null && changes.onlyRemoves) {
      const shrunk = await this.shrink(record, current, changes);
      return { status: "trusted", ...current, grant: grantOf(shrunk), shrunk: idsOf(changes) };
    }
    return { status: "changed", ...current, changes, trustedAt: record.grantedAt };
  }

  /**
   * Saves a person's trust in the workspace. `shownFingerprint` is the full
   * fingerprint the person was shown; it must be exactly the current one,
   * or nothing is saved.
   */
  async grant(
    subject: TrustSubject,
    shownFingerprint: string,
    origin: PersonTrustOrigin,
  ): Promise<Result<TrustGrant, TrustRefusal>> {
    const current = await this.current(subject);
    if (shownFingerprint !== current.fingerprint) {
      return err({ kind: "fingerprint-changed", fingerprint: current.fingerprint });
    }
    const record: TrustRecord = {
      location: subject.location,
      fingerprint: current.fingerprint,
      content: current.content,
      grantedAt: this.clock.now().toISOString(),
      appVersion: this.appVersion,
      pins: {},
      origin,
    };
    await this.store.grant(record);
    return ok(grantOf(record));
  }

  /** Forgets the trust in a workspace, even when its record can't be read. */
  async revoke(location: string): Promise<void> {
    await this.store.revoke(location);
  }

  /**
   * Every trusted workspace, sorted by location.
   *
   * @throws when any record can't be read, naming its location
   */
  async list(): Promise<TrustRecord[]> {
    return await this.store.list();
  }

  private async current(subject: TrustSubject): Promise<CurrentTrust> {
    const content = trustContent({
      connectors: subject.connectors,
      commandPaths: subject.commandPaths,
    });
    return { content, fingerprint: await trustFingerprint(content, this.digest) };
  }

  /**
   * The content the person trusted, or `null` when the record's content
   * doesn't give its own fingerprint (an older scheme, or a hand edit).
   * Such a record can't be shrunk: what it lists isn't what was trusted.
   */
  private async trustedContent(record: TrustRecord): Promise<TrustContent | null> {
    if (!isTrustContent(record.content)) {
      return null;
    }
    const fingerprint = await trustFingerprint(record.content, this.digest);
    return fingerprint === record.fingerprint ? record.content : null;
  }

  private async shrink(
    record: TrustRecord,
    current: CurrentTrust,
    changes: TrustChanges,
  ): Promise<TrustRecord> {
    const removed = new Set(idsOf(changes));
    const pins = Object.fromEntries(
      Object.entries(record.pins).filter(([connector]) => !removed.has(connector)),
    );
    const shrunk: TrustRecord = {
      ...record,
      fingerprint: current.fingerprint,
      content: current.content,
      appVersion: this.appVersion,
      pins,
    };
    await this.store.grant(shrunk);
    return shrunk;
  }
}

function grantOf(record: TrustRecord): TrustGrant {
  return { location: record.location, fingerprint: record.fingerprint };
}

function idsOf(changes: TrustChanges): string[] {
  return changes.removed.map((connector) => connector.id);
}

/** Whether stored content has the shape `trustContent` builds: connectors with an id each. */
function isTrustContent(value: unknown): value is TrustContent {
  if (typeof value !== "object" || value === null || !("connectors" in value)) {
    return false;
  }
  const { connectors } = value;
  return (
    Array.isArray(connectors) &&
    connectors.every(
      (connector: unknown) =>
        typeof connector === "object" &&
        connector !== null &&
        "id" in connector &&
        typeof connector.id === "string",
    )
  );
}
