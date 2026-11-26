import type {
  AgentSpend,
  MergeQueue,
  MessagingId,
  PullRequestDetail,
  PullRequestList,
  Seat,
  SpendRange,
  SpendSummary,
  TeamRuns,
  TeamRunsQuery,
  TeamStatus,
  TeamStatusParts,
} from "@halonicjs/ports";
import { checkedOrigin } from "./address.ts";
import { ChangeFeed } from "./changes.ts";
import { PaperclipIds } from "./ids.ts";
import { eachLimited } from "./inbox.ts";
import { asRecords, text } from "./json.ts";
import { PaperclipReader } from "./reader.ts";
import { fitsSegment, isSafeSegment, type PaperclipRequestName } from "./requests.ts";
import {
  type KnownAgent,
  type PullContext,
  toMergeQueues,
  toPullRequestDetail,
  toPullRequestLists,
} from "./team-pulls.ts";
import {
  finishedRunsLimit,
  pickRuns,
  type TaskName,
  taskNameMaxAgeMs,
  taskReadLanes,
  taskReadLimit,
  toTaskName,
  toTeamRun,
} from "./team-runs.ts";
import { toSeats } from "./team-seats.ts";
import { rangeStart, type SpendContext, toAgentSpend, toSpendSummary } from "./team-spend.ts";
import {
  bodyOf,
  isUnreadable,
  type PaperclipAnswer,
  PaperclipTransport,
  type RequestDetails,
  type TransportOptions,
} from "./transport.ts";

/** One Paperclip connection, as the engine hands it in. The key stays in memory only. */
export interface PaperclipTeamStatusOptions extends TransportOptions {
  /** The connection's name; part of every ID, the same as its `PaperclipMessaging`'s. */
  connection: string;
  /** The Paperclip company the connection reads. */
  company: string;
  now?: () => Date;
}

/** The parts served by a plugin, which a server may not have installed. */
type PluginPart = "seats" | "pullRequests";

/**
 * The Paperclip provider's {@link TeamStatus} for one connection
 * (`paperclip-client.team-status` and `paperclip-client.team-pull-requests`,
 * architecture section 1.5): spend from
 * Paperclip's cost routes, seats from the `halonic.seats` plugin, pull
 * requests and the merge queue from the `halonic.agent-tools` plugin's
 * stored GitHub snapshot. It only reads, sends only the requests on
 * `paperclipRequests`, and holds no GitHub token: the snapshot is the
 * plugin's. A part whose plugin answers 404 reads as not served.
 */
export class PaperclipTeamStatus implements TeamStatus {
  readonly #ids: PaperclipIds;
  readonly #company: string;
  readonly #origin: string;
  readonly #now: () => Date;
  readonly #reader: PaperclipReader;
  readonly #feed = new ChangeFeed<MessagingId>();
  readonly #missing = new Set<PluginPart>();
  #agents = new Map<string, KnownAgent>();
  /** Runs' task names and when each was read; read again once older than `taskNameMaxAgeMs`. */
  readonly #taskNames = new Map<string, { name: TaskName | undefined; readAt: number }>();
  #lastSeen: string | undefined;

  constructor(options: PaperclipTeamStatusOptions) {
    this.#now = options.now ?? (() => new Date());
    this.#ids = new PaperclipIds(options.connection);
    this.#company = options.company;
    this.#origin = checkedOrigin(options.address);
    this.#reader = new PaperclipReader(new PaperclipTransport(options), this.#now);
  }

  async parts(): Promise<readonly TeamStatusParts[]> {
    return [
      {
        source: this.#ids.source(),
        spend: true,
        seats: !this.#missing.has("seats"),
        pullRequests: !this.#missing.has("pullRequests"),
      },
    ];
  }

  async spend(range: SpendRange): Promise<readonly SpendSummary[]> {
    return this.#readSpend(range, true);
  }

  async agentSpend(range: SpendRange): Promise<readonly AgentSpend[]> {
    const details = this.#costDetails(range);
    const byAgent = await this.#reader.read("spendByAgent", details);
    const byAgentModel = await this.#reader.read("spendByAgentModel", details);
    const budgets = await this.#reader.read("budgetsOverview", {
      path: { company: this.#company },
    });
    return toAgentSpend(this.#spendContext(range), { byAgent, byAgentModel, budgets });
  }

  async seats(): Promise<readonly Seat[]> {
    const answer = await this.#pluginRead("seats", "seatsSummary", {});
    return answer === undefined ? [] : toSeats(this.#ids, answer);
  }

  async pullRequests(): Promise<readonly PullRequestList[]> {
    const answer = await this.#pluginRead("pullRequests", "pullRequestsSummary", {});
    return answer === undefined ? [] : toPullRequestLists(await this.#pullContext(), answer);
  }

  async pullRequest(id: MessagingId): Promise<PullRequestDetail | undefined> {
    const [repo, number] = this.#ids.read(id, "pull") ?? [];
    // A number the route would refuse is refused here, before any request.
    if (repo === undefined || number === undefined || !fitsSegment("number", number)) {
      return undefined;
    }
    const details = { path: { number }, query: { repo } };
    const answer = await this.#pluginRead("pullRequests", "pullRequestDetail", details);
    return answer === undefined
      ? undefined
      : toPullRequestDetail(await this.#pullContext(), answer);
  }

  async mergeQueue(): Promise<readonly MergeQueue[]> {
    const answer = await this.#pluginRead("pullRequests", "pullRequestsSummary", {});
    return answer === undefined ? [] : toMergeQueues(await this.#pullContext(), answer);
  }

  /**
   * The live runs, and with `since` the finished ones since then
   * (`paperclip-client.team-runs`). An agent of another connection has no runs here.
   */
  async runs(query: TeamRunsQuery): Promise<readonly TeamRuns[]> {
    if (query.since !== undefined && Number.isNaN(Date.parse(query.since))) {
      // Every finished run would fall outside a bound that isn't a time, with no sign why.
      throw new RangeError("The runs query's `since` isn't a time.");
    }
    const agent = query.agent === undefined ? undefined : this.#ids.read(query.agent, "agent")?.[0];
    if (query.agent !== undefined && (agent === undefined || !isSafeSegment(agent))) {
      return [];
    }
    const path = { company: this.#company };
    const live = asRecords(await this.#reader.read("listLiveRuns", { path }));
    const agentQuery = agent === undefined ? {} : { agentId: agent };
    const finished =
      query.since === undefined
        ? []
        : asRecords(
            await this.#reader.read("listRuns", {
              path,
              query: { ...agentQuery, limit: String(finishedRunsLimit) },
            }),
          );
    const picked = pickRuns(
      { live, finished },
      {
        ...(agent === undefined ? {} : { agent }),
        ...(query.since === undefined ? {} : { since: query.since }),
      },
    );
    await this.#readTaskNames(picked.runs.flatMap((run) => text(run, "issueId") ?? []));
    const tasks = new Map([...this.#taskNames].map(([task, { name }]) => [task, name] as const));
    const context = { ids: this.#ids, tasks };
    return [
      {
        source: this.#ids.source(),
        asOf: this.#now().toISOString(),
        runs: picked.runs.flatMap((run) => toTeamRun(context, run) ?? []),
        complete: picked.complete,
      },
    ];
  }

  changes(): AsyncIterable<MessagingId> {
    return this.#feed.listen();
  }

  /**
   * Reads today's spend, the seats, the pull requests and the queue again and
   * tells `changes` readers when any of them changed. The engine calls it on
   * its 5-minute schedule. Spend is read without `unknownSeatRuns`, so the
   * seats plugin doesn't scan today's cost rows on every refresh.
   */
  async refresh(): Promise<void> {
    const seen = JSON.stringify([
      await this.#readSpend("today", false),
      await this.seats(),
      await this.pullRequests(),
      await this.mergeQueue(),
    ]);
    const changed = this.#lastSeen !== undefined && seen !== this.#lastSeen;
    this.#lastSeen = seen;
    if (changed) {
      this.#feed.push(this.#ids.source());
    }
  }

  /** The range's spend, with the seats plugin's `unknownSeatRuns` when `withSeatRuns`. */
  async #readSpend(range: SpendRange, withSeatRuns: boolean): Promise<readonly SpendSummary[]> {
    const from = rangeStart(range, this.#now());
    const details = { path: { company: this.#company }, query: { from } };
    const summary = await this.#reader.read("spendSummary", details);
    const byProvider = await this.#reader.read("spendByProvider", details);
    const seats = withSeatRuns ? await this.#unknownSeatRunsRead(from) : undefined;
    return [toSpendSummary(this.#spendContext(range), { summary, byProvider, seats })];
  }

  /**
   * The seats plugin's summary since `from`, for its count of runs with no
   * seat, which the cost routes can't tell. Unlike other reads, any failure
   * here gives `undefined` instead of an error: the count is optional, and a
   * plugin fault (a 5xx, or a 400 from its `from` check) shouldn't take the
   * paid money and tokens down with it. Only a 404 marks the seats part as
   * not served; another failure says nothing about whether it is installed.
   */
  async #unknownSeatRunsRead(from: string): Promise<unknown> {
    const query = { from, companyId: this.#company };
    const answer = await this.#reader.send("seatsSummary", { query });
    if (answer.kind === "ok") {
      this.#missing.delete("seats");
      return answer.body;
    }
    if (answer.failure === "not-found") {
      this.#missing.add("seats");
    }
    return undefined;
  }

  /**
   * The body of a plugin read, or `undefined` when the plugin answers 404,
   * which marks its part as not served until it answers again.
   */
  async #pluginRead(
    part: PluginPart,
    name: PaperclipRequestName,
    details: RequestDetails,
  ): Promise<unknown> {
    const query = { ...details.query, companyId: this.#company };
    const answer = await this.#reader.send(name, { ...details, query });
    if (answer.kind === "failed" && answer.failure === "not-found") {
      if (name !== "pullRequestDetail") {
        this.#missing.add(part);
      }
      return undefined;
    }
    const body = bodyOf(name, answer);
    this.#missing.delete(part);
    return body;
  }

  /**
   * Reads the name of each task not read in the last `taskNameMaxAgeMs`, at
   * most `taskReadLimit` of them, `taskReadLanes` at a time. A task the key
   * can't find (404) or may not read (403) has no name; any other failure is
   * thrown, as every read's is.
   */
  async #readTaskNames(tasks: readonly string[]): Promise<void> {
    const now = this.#now().getTime();
    const due = [...new Set(tasks)].filter((task) => {
      const known = this.#taskNames.get(task);
      return isSafeSegment(task) && (known === undefined || now - known.readAt > taskNameMaxAgeMs);
    });
    await eachLimited(due.slice(0, taskReadLimit), taskReadLanes, async (task) => {
      const answer = await this.#reader.send("getTask", { path: { task } });
      const name = isUnreadable(answer) ? undefined : toTaskName(bodyOf("getTask", answer));
      this.#taskNames.set(task, { name, readAt: now });
    });
  }

  #costDetails(range: SpendRange): RequestDetails {
    return { path: { company: this.#company }, query: { from: rangeStart(range, this.#now()) } };
  }

  #spendContext(range: SpendRange): SpendContext {
    return { ids: this.#ids, range, asOf: this.#now().toISOString() };
  }

  /** The mapping's context, with the company's agents read once so branch names find them. */
  async #pullContext(): Promise<PullContext> {
    if (this.#agents.size === 0) {
      const records = asRecords(
        await this.#reader.read("listAgents", { path: { company: this.#company } }),
      );
      this.#agents = new Map(
        records.flatMap((record) => {
          const id = text(record, "id");
          const name = text(record, "name");
          return id === undefined || name === undefined
            ? []
            : [[name.toLowerCase(), { id, name }] as const];
        }),
      );
    }
    return { ids: this.#ids, origin: this.#origin, agents: this.#agents };
  }
}
