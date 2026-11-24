import type {
  AgentSpend,
  MergeQueue,
  MessagingId,
  PullRequestDetail,
  PullRequestList,
  Seat,
  SpendRange,
  SpendSummary,
  TeamStatus,
  TeamStatusParts,
} from "@halonicjs/ports";
import { ChangeFeed } from "./changes.ts";
import { PaperclipIds } from "./ids.ts";
import { PaperclipReader } from "./reader.ts";
import type { PaperclipRequestName } from "./requests.ts";
import { toSeats } from "./team-seats.ts";
import { rangeStart, type SpendContext, toAgentSpend, toSpendSummary } from "./team-spend.ts";
import {
  bodyOf,
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
type PluginPart = "seats";

/**
 * The Paperclip provider's {@link TeamStatus} for one connection
 * (`paperclip-client.team-status`, architecture section 1.5): spend from
 * Paperclip's cost routes and seats from the `halonic.seats` plugin. It
 * only reads and sends only the requests on `paperclipRequests`. A part
 * whose plugin answers 404 reads as not served. Pull requests and the merge
 * queue come next (HAL-17606's second PR); until then that part isn't served.
 */
export class PaperclipTeamStatus implements TeamStatus {
  readonly #ids: PaperclipIds;
  readonly #company: string;
  readonly #now: () => Date;
  readonly #reader: PaperclipReader;
  readonly #feed = new ChangeFeed<MessagingId>();
  readonly #missing = new Set<PluginPart>();
  #lastSeen: string | undefined;

  constructor(options: PaperclipTeamStatusOptions) {
    this.#now = options.now ?? (() => new Date());
    this.#ids = new PaperclipIds(options.connection);
    this.#company = options.company;
    this.#reader = new PaperclipReader(new PaperclipTransport(options), this.#now);
  }

  async parts(): Promise<readonly TeamStatusParts[]> {
    return [
      {
        source: this.#ids.source(),
        spend: true,
        seats: !this.#missing.has("seats"),
        pullRequests: false,
      },
    ];
  }

  async spend(range: SpendRange): Promise<readonly SpendSummary[]> {
    const details = this.#costDetails(range);
    const summary = await this.#reader.read("spendSummary", details);
    const byProvider = await this.#reader.read("spendByProvider", details);
    return [toSpendSummary(this.#spendContext(range), { summary, byProvider })];
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
    return [];
  }

  async pullRequest(_id: MessagingId): Promise<PullRequestDetail | undefined> {
    return undefined;
  }

  async mergeQueue(): Promise<readonly MergeQueue[]> {
    return [];
  }

  changes(): AsyncIterable<MessagingId> {
    return this.#feed.listen();
  }

  /**
   * Reads today's spend and the seats again and tells `changes` readers
   * when either changed. The engine calls it on its 5-minute schedule.
   */
  async refresh(): Promise<void> {
    const seen = JSON.stringify([await this.spend("today"), await this.seats()]);
    const changed = this.#lastSeen !== undefined && seen !== this.#lastSeen;
    this.#lastSeen = seen;
    if (changed) {
      this.#feed.push(this.#ids.source());
    }
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
      this.#missing.add(part);
      return undefined;
    }
    const body = bodyOf(name, answer);
    this.#missing.delete(part);
    return body;
  }

  #costDetails(range: SpendRange): RequestDetails {
    return { path: { company: this.#company }, query: { from: rangeStart(range, this.#now()) } };
  }

  #spendContext(range: SpendRange): SpendContext {
    return { ids: this.#ids, range, asOf: this.#now().toISOString() };
  }
}
