import type {
  MessagingId,
  RunAgainCheck,
  RunAgainResult,
  RunControlRefusal,
  StopRunResult,
  TeamRunControl,
} from "@halonicjs/ports";
import { PaperclipIds } from "./ids.ts";
import { asRecord, asRecords, type JsonRecord, text } from "./json.ts";
import { UnsafeIdError } from "./requests.ts";
import { canStopNow, isLive } from "./team-runs.ts";
import { type PaperclipAnswer, PaperclipTransport, type TransportOptions } from "./transport.ts";

/** One Paperclip connection, as the engine hands it in. The key stays in memory only. */
export interface PaperclipRunControlOptions extends TransportOptions {
  /** The connection's name; part of every ID, the same as its `PaperclipTeamStatus`'s. */
  connection: string;
  /** The Paperclip company the connection controls; a run of any other company is not found. */
  company: string;
}

/** The comment that goes with the wake, so the task's history says why the agent woke. */
export const runAgainComment = "Run again, asked for in Halonic's Runs app.";

/** Task statuses after which there is nothing to run again. */
const closedStatuses = new Set(["done", "cancelled"]);

/**
 * Task statuses that wait on someone else. The wake sets `todo`, so running
 * again would clear the block or the review; Run again isn't offered.
 */
const waitingStatuses = new Set(["blocked", "in_review"]);

type Failed = PaperclipAnswer & { kind: "failed" };

/** The port's refusal for a failed answer. */
function refusalOf(answer: Failed): RunControlRefusal {
  if (answer.failure === "offline" || answer.failure === "signed-out") {
    return "unreachable";
  }
  return answer.failure === "not-found" ? "not-found" : "not-allowed";
}

/** The run's own fields, read again before every write: nothing else of the answer is kept. */
interface FreshRun {
  id: string;
  agent: string;
  task: string | undefined;
  canStop: boolean;
  /** Whether the run is still queued or running, so there is nothing to run again yet. */
  live: boolean;
}

/** Whether Run again may go ahead, with the agent to wake on which task when it may. */
type TaskVerdict =
  | { offered: true; task: string; agent: string }
  | Extract<RunAgainCheck, { offered: false }>;

/**
 * The Paperclip provider's {@link TeamRunControl} for one connection
 * (`paperclip-client.team-run-control`). Every call reads the run again with
 * `getRun`, and Run again reads its task with `getTask`, so nothing the
 * caller holds can stop or wake anything: Stop is sent only while Paperclip
 * says now that the run can stop, and the wake only while the task is open,
 * of this company and still with the run's agent. Refusals are the port's
 * codes; Paperclip's own error text is never returned.
 */
export class PaperclipRunControl implements TeamRunControl {
  readonly #ids: PaperclipIds;
  readonly #company: string;
  readonly #transport: PaperclipTransport;

  constructor(options: PaperclipRunControlOptions) {
    this.#ids = new PaperclipIds(options.connection);
    this.#company = options.company;
    this.#transport = new PaperclipTransport(options);
  }

  async stop(run: MessagingId): Promise<StopRunResult> {
    const fresh = await this.#readRun(run);
    if (typeof fresh === "string") {
      return { outcome: "refused", reason: fresh };
    }
    if (!fresh.canStop) {
      return { outcome: "refused", reason: "not-stoppable" };
    }
    const answer = await this.#transport.send("cancelRun", { path: { run: fresh.id } });
    if (answer.kind === "ok") {
      return { outcome: "stopping" };
    }
    // Paperclip refuses (400) or conflicts (409) on a run that ended in between.
    const ended = answer.failure === "conflict" || (answer.status ?? 0) === 400;
    return { outcome: "refused", reason: ended ? "not-stoppable" : refusalOf(answer) };
  }

  async runAgainCheck(run: MessagingId): Promise<RunAgainCheck> {
    const verdict = await this.#taskVerdict(run);
    return verdict.offered ? { offered: true } : verdict;
  }

  async runAgain(run: MessagingId): Promise<RunAgainResult> {
    const verdict = await this.#taskVerdict(run);
    if (!verdict.offered) {
      return { outcome: "refused", reason: verdict.why };
    }
    const body = { assigneeAgentId: verdict.agent, status: "todo", comment: runAgainComment };
    const answer = await this.#transport.send("wakeTask", { path: { task: verdict.task }, body });
    return answer.kind === "ok"
      ? { outcome: "woken" }
      : { outcome: "refused", reason: refusalOf(answer) };
  }

  /** The run's fresh fields, or why it can't be read. Another company's run is not found. */
  async #readRun(run: MessagingId): Promise<FreshRun | RunControlRefusal> {
    const [id] = this.#ids.read(run, "run") ?? [];
    if (id === undefined) {
      return "not-found";
    }
    const answer = await this.#send("getRun", { run: id });
    if (answer.kind === "failed") {
      return refusalOf(answer);
    }
    const record = asRecord(answer.body);
    const agent = text(record, "agentId");
    if (
      record === undefined ||
      agent === undefined ||
      text(record, "companyId") !== this.#company
    ) {
      return "not-found";
    }
    return {
      id,
      agent,
      task: text(record, "issueId"),
      canStop: canStopNow(record),
      live: isLive(record),
    };
  }

  /** Whether the run's task is open, of this company, and still with the run's agent. */
  async #taskVerdict(run: MessagingId): Promise<TaskVerdict> {
    const fresh = await this.#readRun(run);
    if (typeof fresh === "string") {
      return { offered: false, why: fresh };
    }
    if (fresh.task === undefined) {
      return { offered: false, why: "no-task" };
    }
    if (fresh.live) {
      // Only an ended run is run again; the Runs app offers it for no other.
      return { offered: false, why: "not-allowed" };
    }
    const answer = await this.#send("getTask", { task: fresh.task });
    if (answer.kind === "failed") {
      return { offered: false, why: refusalOf(answer) };
    }
    const task = asRecord(answer.body);
    if (task === undefined || text(task, "companyId") !== this.#company) {
      return { offered: false, why: "not-found" };
    }
    const identifier = text(task, "identifier");
    const named = identifier === undefined ? {} : { task: identifier };
    if (closedStatuses.has(text(task, "status") ?? "")) {
      return { offered: false, why: "task-done", ...named };
    }
    if (waitingStatuses.has(text(task, "status") ?? "")) {
      return { offered: false, why: "not-allowed", ...named };
    }
    const holder = text(task, "assigneeAgentId");
    if (holder !== fresh.agent) {
      return { offered: false, why: "reassigned", ...named, ...(await this.#holderName(holder)) };
    }
    return { offered: true, task: fresh.task, agent: fresh.agent };
  }

  /**
   * The display name of the agent holding the task, when it is an agent the
   * company lists. A person holding it isn't named: only an agent's name is read.
   * A failed `listAgents` read leaves the name out on purpose, so the pane says
   * "someone else" rather than failing the whole check over a name.
   */
  async #holderName(agent: string | undefined): Promise<{ holder?: string }> {
    if (agent === undefined) {
      return {};
    }
    const answer = await this.#transport.send("listAgents", { path: { company: this.#company } });
    const agents: readonly JsonRecord[] = answer.kind === "ok" ? asRecords(answer.body) : [];
    const name = text(
      agents.find((record) => text(record, "id") === agent),
      "name",
    );
    return name === undefined ? {} : { holder: name };
  }

  /** Sends a read; an ID that can't be one path segment reads as not found, with nothing sent. */
  async #send(name: "getRun" | "getTask", path: Readonly<Record<string, string>>) {
    try {
      return await this.#transport.send(name, { path });
    } catch (error) {
      if (error instanceof UnsafeIdError) {
        const notFound: PaperclipAnswer = { kind: "failed", failure: "not-found" };
        return notFound;
      }
      throw error;
    }
  }
}
