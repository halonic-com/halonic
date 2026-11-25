import { asRecord, text } from "./json.ts";
import { type PaperclipRequestName, UnsafeIdError } from "./requests.ts";
import {
  type PaperclipAnswer,
  PaperclipClientError,
  PaperclipTransport,
  type TransportOptions,
} from "./transport.ts";

/** One Paperclip connection, as the engine hands it in. The key stays in memory only. */
export interface PaperclipTasksOptions extends TransportOptions {
  /** The Paperclip company the connection writes to; a task of any other company is not found. */
  company: string;
}

/** Why a task write wasn't made. */
export type TaskWriteRefusal = "offline" | "signed-out" | "not-found" | "refused";

/** What a task write did. */
export type TaskWriteResult =
  /** Paperclip made the change; `status` is the task's status as Paperclip answered it. */
  | { outcome: "written"; task: string; status: string }
  | { outcome: "refused"; reason: TaskWriteRefusal };

type Refused = Extract<TaskWriteResult, { outcome: "refused" }>;

/** The refusal for a failed answer: conflicts and other refusals read as `refused`. */
function refusalOf(answer: PaperclipAnswer & { kind: "failed" }): Refused {
  const { failure } = answer;
  const reason: TaskWriteRefusal =
    failure === "offline" || failure === "signed-out" || failure === "not-found"
      ? failure
      : "refused";
  return { outcome: "refused", reason };
}

/**
 * The two task writes a workflow makes through the Paperclip provider
 * (`paperclip-client.task-writes`, HAL-17975): wake an agent on a task,
 * and close a task as done, each with a comment. They are the routines'
 * only writes, and each is one row of the fixed request list that pins
 * its body, so neither can change anything else on the task.
 *
 * Before writing, it reads the task and writes only to a task of the
 * connection's company. A write is sent once or refused: offline it is
 * `refused` with `offline` and never queued, as for the person's writes.
 */
export class PaperclipTasks {
  readonly #company: string;
  readonly #transport: PaperclipTransport;

  constructor(options: PaperclipTasksOptions) {
    this.#company = options.company;
    this.#transport = new PaperclipTransport(options);
  }

  /**
   * Wakes agent `agent` on task `task`: assigns it to them with status
   * `todo`, which is what wakes an agent in Paperclip, and posts `comment`
   * with the change. `task` is Paperclip's ID or identifier.
   */
  async wake(task: string, agent: string, comment: string): Promise<TaskWriteResult> {
    return this.#write(task, "wakeTask", { assigneeAgentId: agent, status: "todo", comment });
  }

  /** Marks task `task` done and posts `comment` with the change. */
  async finish(task: string, comment: string): Promise<TaskWriteResult> {
    return this.#write(task, "finishTask", { status: "done", comment });
  }

  async #write(
    task: string,
    name: PaperclipRequestName,
    body: Readonly<Record<string, string>>,
  ): Promise<TaskWriteResult> {
    // An empty comment or agent fails the row's body rule; refuse it here, sending nothing.
    if (Object.values(body).some((value) => value.trim() === "")) {
      return { outcome: "refused", reason: "refused" };
    }
    try {
      const found = await this.#taskInCompany(task);
      if (found.outcome === "refused") {
        return found;
      }
      const sent = await this.#transport.send(name, { path: { task: found.id }, body });
      if (sent.kind === "failed") {
        return refusalOf(sent);
      }
      // Paperclip answers a task update with the task; anything else means the write failed.
      const status = text(asRecord(sent.body), "status");
      if (status === undefined) {
        throw new PaperclipClientError(`Paperclip's answer to ${name} has no task.`, "bad-answer");
      }
      return { outcome: "written", task: found.id, status };
    } catch (error) {
      if (error instanceof UnsafeIdError) {
        return { outcome: "refused", reason: "not-found" };
      }
      throw error;
    }
  }

  /** Task `task`'s ID when it belongs to the connection's company; `not-found` otherwise. */
  async #taskInCompany(task: string): Promise<{ outcome: "found"; id: string } | Refused> {
    const answer = await this.#transport.send("getTask", { path: { task } });
    if (answer.kind === "failed") {
      return refusalOf(answer);
    }
    const record = asRecord(answer.body);
    const id = text(record, "id");
    if (id === undefined || text(record, "companyId") !== this.#company) {
      return { outcome: "refused", reason: "not-found" };
    }
    return { outcome: "found", id };
  }
}
