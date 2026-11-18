import type {
  BridgeToolCheck,
  BridgeToolResult,
  BridgeTools,
  Secrets,
  ToolDefinition,
} from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import { readCapped } from "./github-api.ts";
import type { Fetch } from "./pass-through.ts";

/** How long Paperclip may take to answer one call, and how much of its answer the bridge reads. */
export interface PaperclipWriteLimits {
  timeoutMs: number;
  maxAnswerBytes: number;
}

export const defaultPaperclipWriteLimits: PaperclipWriteLimits = {
  timeoutMs: 30_000,
  maxAnswerBytes: 2_000_000,
};

export interface PaperclipWriteToolsOptions {
  /** Where Paperclip is, as an `http` or `https` address with no path, such as `https://paperclip.example`. */
  baseUrl: string;
  /** The one task the tools write to. The program can't name another. */
  taskId: string;
  /**
   * The name of the secret that holds the Paperclip key, read from {@link secrets} on each call.
   * It should hold a short-lived key that may write to {@link taskId} alone.
   */
  secret: string;
  secrets: Secrets;
  fetch: Fetch;
  limits?: PaperclipWriteLimits;
}

const commentLimit = 20_000;

/** The statuses a program may set. Cancelling is left to people. */
const settableStatuses = ["todo", "in_progress", "in_review", "blocked", "done"] as const;

/** A failure whose text the program may read, because it never holds the key or Paperclip's own words. */
class PaperclipToolError extends Error {}

/** One call to Paperclip a tool makes, once its arguments passed the checks. */
interface PaperclipCall {
  method: "POST" | "PATCH";
  path: string;
  body: Record<string, unknown>;
  /** The fields of Paperclip's answer the program may read. */
  answerFields: readonly string[];
}

interface ToolSpec {
  definition: ToolDefinition;
  /** The call the arguments stand for. @throws PaperclipToolError when the arguments aren't acceptable */
  plan(args: Record<string, unknown>): PaperclipCall;
}

/**
 * The tools that write to Paperclip for a harness run inside a sandbox that
 * can reach only the bridge (requirement `harness-bridge.paperclip-write`):
 * comment on one task and change its status.
 *
 * Writing is outward-facing, so {@link check} sends every call with
 * acceptable arguments to a person; a call with arguments that aren't
 * acceptable is refused without asking anyone. The key stays here, as the
 * GitHub token does in {@link GitHubWriteTools}.
 *
 * @example
 * const tools = new PaperclipWriteTools({ baseUrl, taskId, secret: "PAPERCLIP_TASK_KEY", secrets, fetch });
 * await tools.check("paperclip_post_comment", { body: "Done." }); // { kind: "ask", connector: "paperclip" }
 */
export class PaperclipWriteTools implements BridgeTools {
  readonly #options: PaperclipWriteToolsOptions;
  readonly #fetch: Fetch;
  readonly #limits: PaperclipWriteLimits;
  readonly #baseUrl: string;
  readonly #specs: ToolSpec[];

  /** @throws RangeError when `baseUrl` isn't an http(s) address without a path, or `taskId` isn't an id */
  constructor(options: PaperclipWriteToolsOptions) {
    this.#baseUrl = originOf(options.baseUrl);
    if (!/^[A-Za-z0-9-]{1,64}$/.test(options.taskId)) {
      throw new RangeError("The task id must be letters, digits and dashes.");
    }
    this.#options = options;
    this.#fetch = options.fetch;
    this.#limits = options.limits ?? defaultPaperclipWriteLimits;
    this.#specs = toolSpecs(options.taskId);
  }

  async list(): Promise<ToolDefinition[]> {
    return this.#specs.map((spec) => spec.definition);
  }

  async check(name: string, args: Record<string, unknown>): Promise<BridgeToolCheck> {
    const spec = this.#specs.find((candidate) => candidate.definition.name === name);
    if (spec === undefined) return { kind: "refused", reason: `There is no tool called ${name}.` };
    try {
      spec.plan(args);
    } catch (error) {
      if (error instanceof PaperclipToolError) return { kind: "refused", reason: error.message };
      throw error;
    }
    return { kind: "ask", connector: "paperclip" };
  }

  async call(
    name: string,
    args: Record<string, unknown>,
    options: { signal: AbortSignal },
  ): Promise<BridgeToolResult> {
    const spec = this.#specs.find((candidate) => candidate.definition.name === name);
    if (spec === undefined) return failed(`There is no tool called ${name}.`);
    try {
      const call = spec.plan(args);
      return { result: await this.#send(call, options.signal), outcome: "ok" };
    } catch (error) {
      if (error instanceof PaperclipToolError) return failed(error.message);
      // Not our own error: its text could quote the request, so the program doesn't read it.
      return failed("Paperclip could not be reached.");
    }
  }

  async #send(call: PaperclipCall, signal: AbortSignal): Promise<string> {
    const key = await this.#readKey();
    const reply = await this.#fetch(`${this.#baseUrl}${call.path}`, {
      method: call.method,
      redirect: "manual",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "user-agent": "halonic-harness-bridge",
      },
      body: JSON.stringify(call.body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(this.#limits.timeoutMs)]),
    });
    if (!reply.ok) throw new PaperclipToolError(describeFailure(reply.status));
    const { text, cut } = await readCapped(reply, this.#limits.maxAnswerBytes);
    return answerOf(text, cut, call.answerFields);
  }

  /** @throws PaperclipToolError when the secret isn't set, can't be read or isn't fit for a header */
  async #readKey(): Promise<string> {
    const { secret, secrets } = this.#options;
    let key: string | null;
    try {
      key = await secrets.get(secret);
    } catch (error) {
      const cause = error instanceof Error ? error.message : "it failed for an unknown reason";
      throw new PaperclipToolError(`The secret "${secret}" could not be read: ${cause}`);
    }
    if (key === null) {
      throw new PaperclipToolError(
        `The secret "${secret}" that holds the Paperclip key isn't set.`,
      );
    }
    if (!/^[\x21-\x7e]+$/.test(key)) {
      throw new PaperclipToolError(`The secret "${secret}" holds something that isn't a key.`);
    }
    return key;
  }
}

function toolSpecs(taskId: string): ToolSpec[] {
  return [
    {
      definition: {
        name: "paperclip_post_comment",
        description: "Adds a comment to the task this run belongs to. A person approves each call.",
        parameters: {
          type: "object",
          properties: {
            body: {
              type: "string",
              minLength: 1,
              maxLength: commentLimit,
              description: "The comment. Markdown.",
            },
          },
          required: ["body"],
          additionalProperties: false,
        },
      },
      plan: (args) => {
        rejectUnknown(args, ["body"]);
        return {
          method: "POST",
          path: `/api/issues/${taskId}/comments`,
          body: { body: commentText(args["body"]) },
          answerFields: ["id", "createdAt"],
        };
      },
    },
    {
      definition: {
        name: "paperclip_set_status",
        description:
          "Changes the status of the task this run belongs to. A person approves each call. It can't cancel or reassign.",
        parameters: {
          type: "object",
          properties: { status: { type: "string", enum: [...settableStatuses] } },
          required: ["status"],
          additionalProperties: false,
        },
      },
      plan: (args) => {
        rejectUnknown(args, ["status"]);
        const status = args["status"];
        if (!settableStatuses.some((allowed) => allowed === status)) {
          throw new PaperclipToolError(`The status must be one of ${settableStatuses.join(", ")}.`);
        }
        return {
          method: "PATCH",
          path: `/api/issues/${taskId}`,
          body: { status },
          answerFields: ["id", "status"],
        };
      },
    },
  ];
}

/** Arguments the tool doesn't know are a mistake, and the one way a program could ask for more than the tool offers. */
function rejectUnknown(args: Record<string, unknown>, known: readonly string[]): void {
  const unknown = Object.keys(args).find((key) => !known.includes(key));
  if (unknown !== undefined)
    throw new PaperclipToolError(`The tool has no argument called ${unknown}.`);
}

function commentText(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > commentLimit) {
    throw new PaperclipToolError(`The body must be text of at most ${commentLimit} characters.`);
  }
  return value;
}

/** The address's origin, so a path, credentials or query in it can't redirect where the key goes. */
function originOf(address: string): string {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new RangeError("The Paperclip address must be an http or https address.");
  }
  const plain = url.pathname === "/" && url.search === "" && url.hash === "" && url.username === "";
  if ((url.protocol !== "https:" && url.protocol !== "http:") || !plain || url.password !== "") {
    throw new RangeError("The Paperclip address must be an http or https address without a path.");
  }
  return url.origin;
}

function failed(result: string): BridgeToolResult {
  return { result, outcome: "error" };
}

function describeFailure(status: number): string {
  if (status === 401) return "Paperclip refused the key (401).";
  if (status === 403) return "Paperclip refused the call (403): the key may lack access.";
  if (status === 404) return "Paperclip has no such task, or the key can't see it (404).";
  if (status >= 300 && status < 400)
    return `Paperclip answered with a redirect (${status}), which the bridge doesn't follow.`;
  return `Paperclip answered with status ${status}.`;
}

/** What the program reads of Paperclip's answer: the named fields only. */
function answerOf(answer: string, cut: boolean, fields: readonly string[]): string {
  const unexpected = new PaperclipToolError("Paperclip's answer wasn't what the bridge expects.");
  if (cut) throw unexpected;
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer);
  } catch {
    throw unexpected;
  }
  if (!isPlainObject(parsed)) throw unexpected;
  return JSON.stringify(Object.fromEntries(fields.map((name) => [name, parsed[name]])), null, 2);
}
