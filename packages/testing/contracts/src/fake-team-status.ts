import {
  type AgentSpend,
  isAllowedWebLink,
  type MergeQueue,
  type MessagingId,
  type PullRequest,
  type PullRequestDetail,
  type PullRequestEvent,
  type PullRequestList,
  type Seat,
  type SpendRange,
  type SpendSummary,
  type TeamStatus,
  type TeamStatusParts,
} from "@halonicjs/ports";
import { Feed } from "./feed.ts";

/** What a {@link FakeTeamStatus} stamps its times with. */
export interface FakeTeamStatusOptions {
  /** Defaults to 24 Nov 2026, 10:00 UTC, always. */
  now?: () => Date;
  /** What every ID it makes starts with; `fake` unless told otherwise. */
  idPrefix?: string;
}

/** A pull request with its timeline. */
interface HeldPullRequest {
  pullRequest: PullRequest;
  timeline: PullRequestEvent[];
}

/** Everything a source holds, live or as it was when its line was cut. */
interface Held {
  spend: SpendSummary[];
  agentSpend: AgentSpend[];
  seats: Seat[];
  pullRequests: HeldPullRequest[];
  queues: MergeQueue[];
}

/** A source: the parts it serves, its connection's origin and when it was last read. */
interface FakeSource extends TeamStatusParts {
  origin: string;
  asOf: string;
}

const dayMs = 24 * 60 * 60 * 1000;

/** The source of an item that names one. */
const bySource = (item: { source: MessagingId }): MessagingId => item.source;

/**
 * A {@link TeamStatus} that lives in the process, so Studio's Team screens
 * can be built and tested before any provider serves one (requirement
 * `contracts.fake-team-status`). Read-only like the port: a test fills it
 * with `setSpend`, `addAgentSpend`, `addSeat`, `addPullRequest`,
 * `addPullRequestEvent` and `setMergeQueue`, and cuts a source's line with
 * `goOffline`, after which that source reads as it was, as of its last read.
 *
 * Like a provider, it drops a pull request's web link that
 * `isAllowedWebLink` refuses for the source's origin.
 *
 * @example
 * const team = new FakeTeamStatus();
 * const source = team.addSource({ seats: true });
 * team.addSeat(source.source, { label: "Pool 1" });
 */
export class FakeTeamStatus implements TeamStatus {
  private readonly now: () => Date;
  private readonly idPrefix: string;
  private readonly sources: FakeSource[] = [];
  private readonly live: Held = {
    spend: [],
    agentSpend: [],
    seats: [],
    pullRequests: [],
    queues: [],
  };
  private readonly frozen = new Map<MessagingId, Held>();
  private readonly readers = new Set<Feed<MessagingId>>();
  private made = 0;

  constructor(options: FakeTeamStatusOptions = {}) {
    this.now = options.now ?? (() => new Date("2026-11-24T10:00:00.000Z"));
    this.idPrefix = options.idPrefix ?? "fake";
  }

  parts(): Promise<readonly TeamStatusParts[]> {
    const parts = this.sources.map(({ source, spend, seats, pullRequests }) => ({
      source,
      spend,
      seats,
      pullRequests,
    }));
    return Promise.resolve(parts);
  }

  spend(range: SpendRange): Promise<readonly SpendSummary[]> {
    const spend = this.read((held) => held.spend, bySource);
    return Promise.resolve(spend.filter((each) => each.range === range));
  }

  agentSpend(range: SpendRange): Promise<readonly AgentSpend[]> {
    const spend = this.read((held) => held.agentSpend, bySource);
    return Promise.resolve(spend.filter((each) => each.range === range));
  }

  seats(): Promise<readonly Seat[]> {
    return Promise.resolve(this.read((held) => held.seats, bySource));
  }

  pullRequests(): Promise<readonly PullRequestList[]> {
    const held = this.read(
      (each) => each.pullRequests,
      (each) => each.pullRequest.source,
    );
    const lists = new Map<
      string,
      PullRequestList & { open: PullRequest[]; recent: PullRequest[] }
    >();
    const recentSince = this.now().getTime() - dayMs;
    for (const { pullRequest } of held) {
      const key = JSON.stringify([pullRequest.source, pullRequest.repo]);
      const list = lists.get(key) ?? {
        source: pullRequest.source,
        repo: pullRequest.repo,
        asOf: this.sourceOf(pullRequest.source).asOf,
        open: [],
        recent: [],
      };
      lists.set(key, list);
      const ended = pullRequest.state === "merged" || pullRequest.state === "closed";
      if (!ended) list.open.push(pullRequest);
      else if (Date.parse(pullRequest.since) >= recentSince) list.recent.push(pullRequest);
    }
    return Promise.resolve([...lists.values()]);
  }

  pullRequest(id: MessagingId): Promise<PullRequestDetail | undefined> {
    const held = this.read(
      (each) => each.pullRequests,
      (each) => each.pullRequest.source,
    );
    const found = held.find((each) => each.pullRequest.id === id);
    if (found === undefined) return Promise.resolve(undefined);
    const asOf = this.sourceOf(found.pullRequest.source).asOf;
    return Promise.resolve({ ...found, asOf });
  }

  mergeQueue(): Promise<readonly MergeQueue[]> {
    return Promise.resolve(this.read((held) => held.queues, bySource));
  }

  changes(): AsyncIterable<MessagingId> {
    const feed = new Feed<MessagingId>((left) => this.readers.delete(left));
    this.readers.add(feed);
    return feed;
  }

  /** Adds a source that serves every part unless told otherwise, read just now. */
  addSource(source: Partial<Omit<FakeSource, "source" | "asOf">> = {}): TeamStatusParts {
    const added: FakeSource = {
      source: this.newId(),
      spend: true,
      seats: true,
      pullRequests: true,
      origin: "https://paperclip.acme.test",
      ...source,
      asOf: this.stamp(),
    };
    this.sources.push(added);
    return {
      source: added.source,
      spend: added.spend,
      seats: added.seats,
      pullRequests: added.pullRequests,
    };
  }

  /** Sets a source's spend for a range, nothing spent unless told otherwise. */
  setSpend(
    source: MessagingId,
    spend: { range: SpendRange } & Partial<SpendSummary>,
  ): SpendSummary {
    this.serving(source, "spend");
    const summary: SpendSummary = {
      source,
      paid: { cents: 0, currency: "USD" },
      tokens: { input: 0, cached: 0, output: 0 },
      unpricedRuns: 0,
      asOf: this.stamp(),
      ...spend,
    };
    this.live.spend = this.live.spend.filter(
      (each) => each.source !== source || each.range !== spend.range,
    );
    return this.add("spend", source, summary);
  }

  /** Adds an agent's spend for a range, nothing spent unless told otherwise. */
  addAgentSpend(
    source: MessagingId,
    spend: { agent: MessagingId; range: SpendRange } & Partial<AgentSpend>,
  ): AgentSpend {
    this.serving(source, "spend");
    const added: AgentSpend = {
      source,
      paid: { cents: 0, currency: "USD" },
      tokens: { input: 0, cached: 0, output: 0 },
      tokensByModel: [],
      ...spend,
    };
    return this.add("agentSpend", source, added);
  }

  /** Adds a pool seat that is `ok`, with no windows, unless told otherwise. */
  addSeat(source: MessagingId, seat: { label: string } & Partial<Seat>): Seat {
    this.serving(source, "seats");
    const added: Seat = {
      id: this.newId(),
      source,
      role: "pool",
      state: "ok",
      windows: [],
      agents: [],
      manualReset: "none",
      asOf: this.stamp(),
      ...seat,
    };
    return this.add("seats", source, added);
  }

  /** Adds a pull request waiting for review in `app`, by an outside contributor unless told otherwise. */
  addPullRequest(
    source: MessagingId,
    pullRequest: { label: string; title: string } & Partial<PullRequest>,
  ): PullRequest {
    this.serving(source, "pullRequests");
    const added: PullRequest = {
      id: this.newId(),
      source,
      repo: "app",
      author: { kind: "person", name: "outside contributor" },
      state: "waiting-for-review",
      since: this.stamp(),
      fastTrack: false,
      ...pullRequest,
    };
    const { webLink, ...withoutLink } = added;
    const allowed =
      webLink === undefined || isAllowedWebLink(webLink, this.sourceOf(source).origin);
    const kept = allowed ? added : withoutLink;
    return this.add("pullRequests", source, { pullRequest: kept, timeline: [] }).pullRequest;
  }

  /** Adds a step to a pull request's timeline, now unless told otherwise. */
  addPullRequestEvent(
    id: MessagingId,
    event: Omit<PullRequestEvent, "at"> & { at?: string },
  ): void {
    const found = this.live.pullRequests.find((each) => each.pullRequest.id === id);
    if (found === undefined) throw new Error(`no pull request has the id ${id}`);
    found.timeline.push({ at: this.stamp(), ...event });
    this.changed(found.pullRequest.source);
  }

  /** Sets a source's merge queue for `app`, empty unless told otherwise. */
  setMergeQueue(source: MessagingId, queue: Partial<MergeQueue> = {}): MergeQueue {
    this.serving(source, "pullRequests");
    const added: MergeQueue = {
      source,
      repo: "app",
      health: "empty",
      groups: [],
      waiting: [],
      removedToday: [],
      asOf: this.stamp(),
      ...queue,
    };
    this.live.queues = this.live.queues.filter(
      (each) => each.source !== source || each.repo !== added.repo,
    );
    return this.add("queues", source, added);
  }

  /** Cuts a source's line: it reads as it is now, as of its last read. */
  goOffline(source: MessagingId): void {
    this.sourceOf(source);
    if (this.frozen.has(source)) return;
    const pick = <Item extends { source: MessagingId }>(items: Item[]) =>
      copy(items.filter((each) => each.source === source));
    this.frozen.set(source, {
      spend: pick(this.live.spend),
      agentSpend: pick(this.live.agentSpend),
      seats: pick(this.live.seats),
      pullRequests: copy(
        this.live.pullRequests.filter((each) => each.pullRequest.source === source),
      ),
      queues: pick(this.live.queues),
    });
    this.changed(source, true);
  }

  /** Restores a source's line: it reads live again, as of now. */
  goOnline(source: MessagingId): void {
    this.frozen.delete(source);
    this.sourceOf(source).asOf = this.stamp();
    this.changed(source);
  }

  /** Live items of online sources, and what offline sources held when their line was cut. */
  private read<Item>(pick: (held: Held) => Item[], sourceOf: (item: Item) => MessagingId): Item[] {
    const live = pick(this.live).filter((item) => !this.frozen.has(sourceOf(item)));
    return copy([...live, ...[...this.frozen.values()].flatMap(pick)]);
  }

  private add<Key extends keyof Held>(
    key: Key,
    source: MessagingId,
    item: Held[Key][number],
  ): Held[Key][number] {
    (this.live[key] as Held[Key][number][]).push(item);
    this.changed(source);
    return copy(item);
  }

  /** Throws unless the source serves the part, as a provider without it has nothing to give. */
  private serving(source: MessagingId, part: "spend" | "seats" | "pullRequests"): void {
    if (!this.sourceOf(source)[part]) throw new Error(`source ${source} doesn't serve ${part}`);
  }

  private sourceOf(source: MessagingId): FakeSource {
    const found = this.sources.find((each) => each.source === source);
    if (found === undefined) throw new Error(`no source has the id ${source}`);
    return found;
  }

  /** Tells every reader the source changed; a live change marks it read now. A change behind a cut line shows once it is back. */
  private changed(source: MessagingId, evenOffline = false): void {
    if (this.frozen.has(source) && !evenOffline) return;
    if (!this.frozen.has(source)) this.sourceOf(source).asOf = this.stamp();
    for (const reader of this.readers) reader.push(source);
  }

  private newId(): MessagingId {
    this.made += 1;
    return `${this.idPrefix}-${this.made}`;
  }

  private stamp(): string {
    return this.now().toISOString();
  }
}

/** A deep copy of plain data, so a test can't change the fake's items through what a read gave. */
function copy<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}
