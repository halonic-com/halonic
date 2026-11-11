// The sites each step's sandbox refused, worked out from a run's
// `sandbox.blocked` events, so the run page and the run log view can name
// each site once with its tries (HAL-1708), not once per retry. Data only:
// the words come from the message catalogue.

import type { RunEvent } from "./run-event.ts";

/** One site a step's sandbox refused, with how many times it was tried. */
export interface BlockedSite {
  /** The host, `A`–`Z` lowercased and without a trailing dot. Show it with `siteName` from std. */
  readonly host: string;
  /** The refused connections to it in the step, all ports together. */
  readonly tries: number;
}

/** The blocked sites of one visit of a step. */
export interface StepBlockedSites {
  readonly state: string;
  readonly agent: string;
  /** Set for a step in one branch of a parallel state. */
  readonly branch?: string;
  /** Set for a step in one item of a for-each state. */
  readonly item?: number;
  /** The `seq` of the step's first blocked site: where the run log view shows the line. */
  readonly firstSeq: number;
  /** The sites to show, most tries first, then A to Z, at most the `limit` asked for. */
  readonly sites: readonly BlockedSite[];
  /** How many more sites were blocked than `sites` shows. */
  readonly moreSites: number;
  /** The tries of those further sites together. */
  readonly moreTries: number;
  /**
   * Refused accesses past the targets the log names (`others`), files and
   * sites together, which the log doesn't tell apart. 0 when there are none.
   */
  readonly otherBlocks: number;
}

/** How many sites {@link blockedSites} lists per step. */
export interface BlockedSitesOptions {
  /**
   * 5 for a step's entry on the run page, 20 for the run log view
   * (sandbox-screens 2.2). A whole number, 0 or more.
   */
  readonly limit: number;
}

/** What one step's blocks add up to while the log is read. */
interface Tally {
  readonly step: Omit<StepBlockedSites, "sites" | "moreSites" | "moreTries" | "otherBlocks">;
  /** The latest count of each site and port, by `[host, port]`. */
  readonly counts: Map<string, { host: string; count: number }>;
}

/**
 * Names each site a step's sandbox refused once, with its tries
 * (requirement `events.blocked-sites`). A step is one visit of a state: a
 * new `state.entered` starts a new one. A `sandbox.blocked` event's `count`
 * is a running total, so the latest one for a site and port counts, and
 * the ports of one site add up. Blocked files aren't sites and are left
 * out; a step with no blocked site isn't listed.
 *
 * @param events - one run's log, in `seq` order
 * @param options - how many sites to list per step
 * @returns the steps with blocked sites, in the order of their first one
 * @throws RangeError when `limit` isn't a whole number, 0 or more
 *
 * @example
 * blockedSites(events, { limit: 5 });
 * // => [{ state: "install", agent: "writer", firstSeq: 12, sites: [{ host: "registry.npmjs.org", tries: 12 }],
 * //       moreSites: 0, moreTries: 0, otherBlocks: 0 }]
 */
export function blockedSites(
  events: readonly RunEvent[],
  options: BlockedSitesOptions,
): StepBlockedSites[] {
  if (!Number.isInteger(options.limit) || options.limit < 0) {
    throw new RangeError(
      `blockedSites: limit must be a whole number, 0 or more, not ${options.limit}`,
    );
  }
  const visits = new Map<string, number>();
  const tallies = new Map<string, Tally>();
  const others = new Map<string, number>();
  for (const event of events) {
    if (event.type === "state.entered") visits.set(event.state, event.seq);
    if (event.type !== "sandbox.blocked" || event.block.kind === "file") continue;
    const key = JSON.stringify([event.state, event.branch, event.item, visits.get(event.state)]);
    if (event.block.kind === "others") {
      others.set(key, event.count);
      continue;
    }
    const tally = tallies.get(key) ?? newTally(event);
    tallies.set(key, tally);
    const host = plainHost(event.block.host);
    tally.counts.set(JSON.stringify([host, event.block.port]), { host, count: event.count });
  }
  return [...tallies].map(([key, tally]) => summary(tally, others.get(key) ?? 0, options.limit));
}

function newTally(event: Extract<RunEvent, { type: "sandbox.blocked" }>): Tally {
  const step = {
    state: event.state,
    agent: event.agent,
    ...(event.branch === undefined ? {} : { branch: event.branch }),
    ...(event.item === undefined ? {} : { item: event.item }),
    firstSeq: event.seq,
  };
  return { step, counts: new Map() };
}

/**
 * One host however the sandbox wrote it: `API.Example.com.` is
 * `api.example.com`. Only `A`–`Z` are lowercased, as `siteName` does:
 * Unicode lowercasing turns the Kelvin sign (U+212A) into a plain `k`, so a
 * look-alike would pass for the real name.
 */
function plainHost(host: string): string {
  const lower = host.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  return lower.endsWith(".") ? lower.slice(0, -1) : lower;
}

function summary(tally: Tally, otherBlocks: number, limit: number): StepBlockedSites {
  const triesByHost = new Map<string, number>();
  for (const { host, count } of tally.counts.values()) {
    triesByHost.set(host, (triesByHost.get(host) ?? 0) + count);
  }
  const sites = [...triesByHost].map(([host, tries]) => ({ host, tries })).sort(mostTriesFirst);
  const more = sites.slice(limit);
  return {
    ...tally.step,
    sites: sites.slice(0, limit),
    moreSites: more.length,
    moreTries: more.reduce((total, site) => total + site.tries, 0),
    otherBlocks,
  };
}

/** Most tries first, then A to Z by code point, the same on every computer. */
function mostTriesFirst(first: BlockedSite, second: BlockedSite): number {
  if (first.tries !== second.tries) return second.tries - first.tries;
  if (first.host === second.host) return 0;
  return first.host < second.host ? -1 : 1;
}
