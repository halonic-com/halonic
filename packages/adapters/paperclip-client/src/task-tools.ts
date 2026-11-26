import { type ConnectorClient, type ConnectorTool, ConnectorToolError } from "@halonicjs/ports";
import { asRecord, text } from "./json.ts";
import { PaperclipTasks, type PaperclipTasksOptions, type TaskWriteResult } from "./tasks.ts";
import { PaperclipClientError, PaperclipTransport } from "./transport.ts";

/** The tool that reads the agent-tools plugin's last PR watcher pass. */
export const prWatcherPassTool = "pr-watcher-pass";

/** What {@link PaperclipTaskTools} needs. */
export interface PaperclipTaskToolsOptions {
  /** The connector's id in the workspace, which its failures name. */
  readonly id: string;
  /**
   * The connection as it is at this call: the address, the company and the key guard, or
   * `undefined` when no key is stored for it, so the call fails as `signed-out`. Read at every
   * call, so a sign-in or Disconnect counts from the next call on.
   */
  readonly open: () => Promise<PaperclipTasksOptions | undefined>;
  /** Whether the workspace is trusted: without it, only the read tool is listed or called. */
  readonly trusted: boolean;
}

const noArguments = { type: "object", properties: {}, additionalProperties: false };

const textArgument = (description: string) => ({ type: "string", minLength: 1, description });

const tools: readonly ConnectorTool[] = [
  {
    name: prWatcherPassTool,
    description:
      "Reads the PR watcher's last pass from the agent-tools plugin: when it ran, its input and the actions it took.",
    parameters: noArguments,
    risk: "read",
  },
  {
    name: "wake",
    description: "Wakes an agent on a task: assigns it to them as todo, with a comment.",
    parameters: {
      type: "object",
      properties: {
        task: textArgument("The task's identifier or ID."),
        agent: textArgument("The agent's ID."),
        comment: textArgument("The comment posted with the change."),
      },
      required: ["task", "agent", "comment"],
      additionalProperties: false,
    },
    risk: "write",
  },
  {
    name: "finish",
    description: "Marks a task done, with a comment.",
    parameters: {
      type: "object",
      properties: {
        task: textArgument("The task's identifier or ID."),
        comment: textArgument("The comment posted with the change."),
      },
      required: ["task", "comment"],
      additionalProperties: false,
    },
    risk: "write",
  },
];

/** One task write, and how to tell it already landed on the task as Paperclip answers it. */
interface TaskWrite {
  readonly task: string;
  send(tasks: PaperclipTasks): Promise<TaskWriteResult>;
  landed(task: Readonly<Record<string, unknown>>): boolean;
}

/**
 * The built-in `paperclip` connector (`paperclip-client.task-tools`, HAL-19721): a workflow's
 * tool steps read the PR watcher's pass and wake or finish a task through one of the workspace's
 * Paperclip connections. Every request is a row of the fixed request list, and the key comes
 * through the connection's guard at each call, never from the workspace.
 *
 * A write is sent once and never queued. Signed out, a task of another company, or a refusal
 * fails the step with a {@link ConnectorToolError} that names why. Offline, or an answer it
 * can't read, the write may or may not have landed: it throws a plain error, so the run waits
 * for a person to retry or skip, and a retry under the same idempotency key reads the task
 * first and sends nothing when the task already shows the change.
 */
export class PaperclipTaskTools implements ConnectorClient {
  readonly id: string;
  readonly local = false;
  readonly #open: PaperclipTaskToolsOptions["open"];
  readonly #trusted: boolean;
  /** The idempotency keys of writes that ended offline or with an unreadable answer. */
  readonly #uncertain = new Set<string>();

  constructor(options: PaperclipTaskToolsOptions) {
    this.id = options.id;
    this.#open = options.open;
    this.#trusted = options.trusted;
  }

  async listTools(): Promise<ConnectorTool[]> {
    return tools.filter((tool) => this.#trusted || tool.risk === "read");
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    options: { idempotencyKey?: string } = {},
  ): Promise<string> {
    if (name === prWatcherPassTool) {
      return this.#readPass();
    }
    const write = writeOf(name, args);
    if (write === undefined) {
      throw new ConnectorToolError(this.id, name, "no such tool, or its arguments aren't text");
    }
    if (!this.#trusted) {
      throw new ConnectorToolError(this.id, name, "the workspace isn't trusted, so it can't write");
    }
    return this.#write(name, write, options.idempotencyKey);
  }

  async close(): Promise<void> {}

  async #readPass(): Promise<string> {
    const connection = await this.#connection(prWatcherPassTool);
    const transport = new PaperclipTransport(connection);
    const answer = await transport.send("prWatcherPass", {
      query: { companyId: connection.company },
    });
    if (answer.kind === "ok") {
      return JSON.stringify(answer.body);
    }
    if (answer.failure === "offline") {
      throw new Error(`Paperclip couldn't be reached for ${prWatcherPassTool}.`);
    }
    throw new ConnectorToolError(this.id, prWatcherPassTool, answer.failure);
  }

  async #write(
    name: string,
    write: TaskWrite,
    idempotencyKey: string | undefined,
  ): Promise<string> {
    const connection = await this.#connection(name);
    if (idempotencyKey !== undefined && this.#uncertain.has(idempotencyKey)) {
      const landed = await this.#landed(connection, write);
      if (landed !== undefined) return landed;
    }
    let result: TaskWriteResult;
    try {
      result = await write.send(new PaperclipTasks(connection));
    } catch (error) {
      if (error instanceof PaperclipClientError && error.reason === "bad-answer") {
        this.#markUncertain(idempotencyKey);
      }
      throw error;
    }
    if (result.outcome === "written") {
      if (idempotencyKey !== undefined) this.#uncertain.delete(idempotencyKey);
      return JSON.stringify({ task: result.task, status: result.status });
    }
    if (result.reason === "offline") {
      this.#markUncertain(idempotencyKey);
      throw new Error(`Paperclip couldn't be reached for ${name}; it may not have been written.`);
    }
    throw new ConnectorToolError(this.id, name, result.reason);
  }

  /** The written answer when the task already shows `write`, read before a retry; `undefined` to send it. */
  async #landed(connection: PaperclipTasksOptions, write: TaskWrite): Promise<string | undefined> {
    const answer = await new PaperclipTransport(connection).send("getTask", {
      path: { task: write.task },
    });
    const task = answer.kind === "ok" ? asRecord(answer.body) : undefined;
    if (task === undefined || text(task, "companyId") !== connection.company) return undefined;
    const id = text(task, "id");
    const status = text(task, "status");
    if (id === undefined || status === undefined || !write.landed(task)) return undefined;
    return JSON.stringify({ task: id, status });
  }

  #markUncertain(idempotencyKey: string | undefined): void {
    if (idempotencyKey !== undefined) this.#uncertain.add(idempotencyKey);
  }

  async #connection(tool: string): Promise<PaperclipTasksOptions> {
    const connection = await this.#open();
    if (connection === undefined) {
      throw new ConnectorToolError(this.id, tool, "signed-out");
    }
    return connection;
  }
}

/** The write tool `name` asks for with `args`, or `undefined` when there is none or an argument isn't text. */
function writeOf(name: string, args: Readonly<Record<string, unknown>>): TaskWrite | undefined {
  const { task, agent, comment } = args;
  if (typeof task !== "string" || typeof comment !== "string") return undefined;
  if (name === "wake" && typeof agent === "string") {
    return {
      task,
      send: (tasks) => tasks.wake(task, agent, comment),
      landed: (found) =>
        text(found, "assigneeAgentId") === agent && text(found, "status") === "todo",
    };
  }
  if (name === "finish") {
    return {
      task,
      send: (tasks) => tasks.finish(task, comment),
      landed: (found) => text(found, "status") === "done",
    };
  }
  return undefined;
}
