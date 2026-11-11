// Decides whether a workspace is trusted, as `app.trust-service` asks: it
// builds the trust content, fingerprints it and compares it with the trust
// record in the user's profile. Only a person adds to a record (HAL-571);
// a change that only removes whole connectors, harness agents, local
// integrations or model providers shrinks it (HAL-65 decision 9).

import type { Agent, Connector, Provider } from "@halonicjs/format";
import type { TrustGrant, TrustRecord } from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";
import {
  type LocalIntegrationInput,
  type RefusedConnector,
  type TrustChanges,
  type TrustContent,
  trustChanges,
  trustContent,
  trustFingerprint,
} from "@halonicjs/workspace";
import {
  checkPluginTrust,
  grantPluginTrust,
  type PluginTrustCheck,
  type PluginTrustSubject,
} from "./plugin-trust.ts";
import {
  grantOf,
  type PersonTrustOrigin,
  readTrustRecord,
  savePersonTrust,
  type TrustRefusal,
  type TrustServiceOptions,
} from "./trust-record.ts";
import { isTrustContent, unpinnedConnectors } from "./workspace-trust-rules.ts";

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
  /**
   * The workspace's agents, as parsed from their files. Required, so the
   * program, sites and folder of each harness agent are always in the
   * fingerprint (HAL-189 stack 3c).
   */
  readonly agents: readonly Agent[];
  /**
   * The workspace's local integrations, with its settings for each and the
   * hash of its code. Required, so every local integration, its code and the
   * address each `{ fromSetting }` host reads are always in the fingerprint,
   * and a change asks for trust again (trust build plan item 3a on HAL-188;
   * design on HAL-1873, section 5).
   */
  readonly integrations: readonly LocalIntegrationInput[];
  /**
   * The workspace's model providers, as parsed from their files. Required,
   * so where each one sends its key, and which key, are always in the
   * fingerprint, and a change asks for trust again (HAL-5200).
   */
  readonly providers: readonly Provider[];
}

/** What the workspace holds now, as the prompt shows it. */
interface CurrentTrust {
  readonly content: TrustContent;
  /** The full fingerprint, such as "hfp1:9f86d081…". Never shortened. */
  readonly fingerprint: string;
  /**
   * The connectors whose program is a package runner (`npx`, `uvx` and the
   * like) without a pinned version, by id and sorted. They fetch code each
   * time they start, so the prompt asks a second question for them (build
   * plan item 10c). Not part of the fingerprint: the command and args are.
   * A person's trust saves no pins in 0.1 (pinning at trust is Later,
   * HAL-2114), so every package runner is listed.
   */
  readonly unpinned: readonly string[];
}

/**
 * A workspace whose content can't be trusted, such as a connector whose URL
 * has user info. It has no fingerprint, so no record can match it and
 * nothing in it starts until its files are fixed (HAL-5421).
 */
interface RefusedTrust {
  readonly status: "refused";
  readonly content: TrustContent;
  /** What can't be trusted and why, sorted by id. Never its address, which may hold a password. */
  readonly refused: readonly RefusedConnector[];
}

/** What a record lost when it shrank, by id and in the order the content lists them. */
export interface TrustShrink {
  /** The connectors that were removed. */
  readonly connectors: readonly string[];
  /** The harness agents that were removed or went back to Halonic's own harness. */
  readonly agents: readonly string[];
  /** The local integrations that were removed, or no longer read an address from a setting. */
  readonly integrations: readonly string[];
  /** The model providers that were removed or became the test model. */
  readonly providers: readonly string[];
}

/** Whether a workspace is trusted, and if not, why. */
export type TrustCheck =
  | (CurrentTrust & {
      readonly status: "trusted";
      readonly grant: TrustGrant;
      /** What the record lost because it was removed. Every list is empty when nothing was. */
      readonly shrunk: TrustShrink;
      /** When the person trusted it, as ISO text, for "Nothing changed since 3 Nov". */
      readonly trustedAt: string;
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
    })
  | RefusedTrust;

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
 * const check = await trust.check({ location, connectors, commandPaths, agents, integrations, providers });
 * if (check.status === "refused") return fixFiles(check.refused); // exit code 2
 * if (check.status !== "trusted") return refuse(check.fingerprint); // exit code 3
 */
export class TrustService {
  private readonly options: TrustServiceOptions;

  constructor(options: TrustServiceOptions) {
    this.options = options;
  }

  /**
   * Whether the workspace is trusted now. A change that only removes whole
   * connectors or harness agents shrinks the record and counts as trusted, without asking.
   * Content with something that can't be trusted is `refused`, whatever the record says.
   *
   * @throws when shrinking the record can't be saved
   */
  async check(subject: TrustSubject): Promise<TrustCheck> {
    const content = contentOf(subject);
    if (content.refused !== undefined && content.refused.length > 0) {
      return { status: "refused", content, refused: content.refused };
    }
    const current = await this.current(subject, content);
    const stored = await readTrustRecord(this.options.store, subject.location);
    if (stored.status === "unreadable") {
      return { status: "unreadable", ...current, error: stored.error };
    }
    if (stored.status === "none") {
      return { status: "new", ...current };
    }
    const { record } = stored;
    if (record.fingerprint === current.fingerprint) {
      return {
        status: "trusted",
        ...current,
        grant: grantOf(record),
        shrunk: NOTHING_SHRUNK,
        trustedAt: record.grantedAt,
      };
    }

    const trusted = await this.trustedContent(record);
    const changes = trustChanges(trusted ?? { connectors: [] }, current.content);
    if (trusted !== null && changes.onlyRemoves) {
      const shrunk = await this.shrink(record, current, changes);
      return {
        status: "trusted",
        ...current,
        grant: grantOf(shrunk),
        shrunk: removedIds(changes),
        trustedAt: shrunk.grantedAt,
      };
    }
    return { status: "changed", ...current, changes, trustedAt: record.grantedAt };
  }

  /**
   * Saves a person's trust in the workspace. `shownFingerprint` is the full
   * fingerprint the person was shown; it must be exactly the current one,
   * or nothing is saved.
   *
   * @throws RangeError when the check is `refused`: such content has no fingerprint
   */
  async grant(
    subject: TrustSubject,
    shownFingerprint: string,
    origin: PersonTrustOrigin,
  ): Promise<Result<TrustGrant, TrustRefusal>> {
    const current = await this.current(subject, contentOf(subject));
    if (shownFingerprint !== current.fingerprint) {
      return err({ kind: "fingerprint-changed", fingerprint: current.fingerprint });
    }
    const { content, fingerprint } = current;
    const trust = { location: subject.location, fingerprint, content, pins: {}, origin };
    return ok(await savePersonTrust(this.options, trust));
  }

  /**
   * Whether a plugin is trusted now. Unlike a workspace, a plugin record
   * never shrinks: any change turns the plugin off until a person trusts
   * it again.
   */
  async checkPlugin(subject: PluginTrustSubject): Promise<PluginTrustCheck> {
    return await checkPluginTrust(this.options, subject);
  }

  /**
   * Saves a person's trust in a plugin, with each local tool's package pin.
   * `shownFingerprint` must be exactly the current one, or nothing is saved.
   */
  async grantPlugin(
    subject: PluginTrustSubject,
    shownFingerprint: string,
    origin: PersonTrustOrigin,
  ): Promise<Result<TrustGrant, TrustRefusal>> {
    return await grantPluginTrust(this.options, subject, shownFingerprint, origin);
  }

  /** Forgets the trust in a workspace or plugin, even when its record can't be read. */
  async revoke(location: string): Promise<void> {
    await this.options.store.revoke(location);
  }

  /**
   * Every trusted workspace, sorted by location.
   *
   * @throws when any record can't be read, naming its location
   */
  async list(): Promise<TrustRecord[]> {
    return await this.options.store.list();
  }

  private async current(subject: TrustSubject, content: TrustContent): Promise<CurrentTrust> {
    return {
      content,
      fingerprint: await trustFingerprint(content, this.options.digest),
      unpinned: unpinnedConnectors(subject.connectors),
    };
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
    const fingerprint = await trustFingerprint(record.content, this.options.digest);
    return fingerprint === record.fingerprint ? record.content : null;
  }

  private async shrink(
    record: TrustRecord,
    current: CurrentTrust,
    changes: TrustChanges,
  ): Promise<TrustRecord> {
    // Pins belong to connectors; a removed agent has none.
    const removed = new Set(removedIds(changes).connectors);
    const pins = Object.fromEntries(
      Object.entries(record.pins).filter(([connector]) => !removed.has(connector)),
    );
    const shrunk: TrustRecord = {
      ...record,
      fingerprint: current.fingerprint,
      content: current.content,
      appVersion: this.options.appVersion,
      pins,
    };
    await this.options.store.grant(shrunk);
    return shrunk;
  }
}

function contentOf(subject: TrustSubject): TrustContent {
  return trustContent({
    connectors: subject.connectors,
    commandPaths: subject.commandPaths,
    agents: subject.agents,
    integrations: subject.integrations,
    providers: subject.providers,
  });
}

const NOTHING_SHRUNK: TrustShrink = { connectors: [], agents: [], integrations: [], providers: [] };

function removedIds(changes: TrustChanges): TrustShrink {
  return {
    connectors: changes.removed.map((connector) => connector.id),
    agents: changes.agents.removed.map((agent) => agent.id),
    integrations: changes.integrations.removed.map((integration) => integration.id),
    providers: changes.providers.removed.map((provider) => provider.id),
  };
}
