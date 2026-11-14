import type {
  BridgeToolCheck,
  BridgeToolResult,
  BridgeTools,
  Secrets,
  ToolDefinition,
} from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import type { Fetch } from "./pass-through.ts";

/** The one host the tools call. GitHub's API is the only place the bridge sends the secret. */
const githubApi = "https://api.github.com";

/** What the tools read and how long they wait. */
export interface GitHubReadLimits {
  /** How long GitHub may take to answer one call, in milliseconds. */
  timeoutMs: number;
  /** The most text one result holds, and the most of a diff the bridge reads; a longer one is cut and says so. */
  maxResultBytes: number;
  /**
   * The most of a JSON answer the bridge reads. It is larger than
   * {@link maxResultBytes} because GitHub's raw answer (a file's patch, a
   * check's output) is far bigger than the trimmed result built from it.
   */
  maxAnswerBytes: number;
}

export const defaultGitHubReadLimits: GitHubReadLimits = {
  timeoutMs: 30_000,
  maxResultBytes: 200_000,
  maxAnswerBytes: 2_000_000,
};

export interface GitHubReadToolsOptions {
  /** The one repository the tools read, as `owner/name`. The program can't name another. */
  repository: string;
  /** The name of the secret that holds the GitHub token, read from {@link secrets} on each call. */
  secret: string;
  secrets: Secrets;
  fetch?: Fetch;
  limits?: GitHubReadLimits;
}

/** What a tool read: the text, and whether GitHub's answer was longer than the bridge reads. */
interface ToolOutput {
  text: string;
  cut: boolean;
}

interface ToolSpec {
  definition: ToolDefinition;
  run(context: CallContext, number: number): Promise<ToolOutput>;
}

interface CallContext {
  /** The text of GitHub's answer, up to the limit. */
  text(path: string, accept?: string): Promise<ToolOutput>;
  /** GitHub's answer as JSON. @throws GitHubReadError when it is longer than the limit, since a cut answer can't be read as JSON */
  json(path: string): Promise<unknown>;
}

const whole = (text: string): ToolOutput => ({ text, cut: false });

const numberParameter = {
  type: "object",
  properties: {
    number: { type: "integer", minimum: 1, description: "The pull request's number." },
  },
  required: ["number"],
  additionalProperties: false,
};

/**
 * Read-only GitHub tools on one repository, for a harness run inside a
 * sandbox that can reach only the bridge (requirement `harness-bridge.github-read`).
 * They are {@link BridgeTools}, so the engine offers them next to its own and
 * the bridge records each call as `tool.called` and `tool.result`.
 *
 * The token stays here: it is read from the `Secrets` port for each call,
 * goes only to GitHub's API host, and never appears in a result, an error or
 * an event. Every call is a `GET`, so nothing is ever changed on GitHub.
 *
 * @example
 * const tools = new GitHubReadTools({ repository: "halonic-com/halonic", secret: "GITHUB_READ_TOKEN", secrets });
 * await tools.call("github_get_pull_request", { number: 12 }, { signal });
 */
export class GitHubReadTools implements BridgeTools {
  readonly #options: GitHubReadToolsOptions;
  readonly #fetch: Fetch;
  readonly #limits: GitHubReadLimits;
  readonly #specs: ToolSpec[];

  /** @throws RangeError when `repository` isn't `owner/name` */
  constructor(options: GitHubReadToolsOptions) {
    if (!isRepository(options.repository)) {
      throw new RangeError("The repository must be written as owner/name.");
    }
    this.#options = options;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#limits = options.limits ?? defaultGitHubReadLimits;
    this.#specs = this.#toolSpecs();
  }

  async list(): Promise<ToolDefinition[]> {
    return this.#specs.map((spec) => spec.definition);
  }

  async check(name: string, _args: Record<string, unknown>): Promise<BridgeToolCheck> {
    if (this.#specs.some((spec) => spec.definition.name === name)) return { kind: "run" };
    return { kind: "refused", reason: `There is no tool called ${name}.` };
  }

  async call(
    name: string,
    args: Record<string, unknown>,
    options: { signal: AbortSignal },
  ): Promise<BridgeToolResult> {
    const spec = this.#specs.find((candidate) => candidate.definition.name === name);
    if (spec === undefined) return failed(`There is no tool called ${name}.`);
    const number = args["number"];
    if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1) {
      return failed("The number must be a whole number of 1 or more.");
    }
    try {
      const output = await spec.run(await this.#context(options.signal), number);
      return { result: this.#finish(output), outcome: "ok" };
    } catch (error) {
      if (error instanceof GitHubReadError) return failed(error.message);
      // Not our own error: its text could quote the request, so the program doesn't read it.
      return failed("GitHub could not be reached.");
    }
  }

  #toolSpecs(): ToolSpec[] {
    const { repository } = this.#options;
    const pull = (number: number) => `/repos/${repository}/pulls/${number}`;
    return [
      {
        definition: {
          name: "github_get_pull_request",
          description: `Reads one pull request of ${repository}: title, description, state, branches and head commit.`,
          parameters: numberParameter,
        },
        run: async (context, number) => whole(pullRequestSummary(await context.json(pull(number)))),
      },
      {
        definition: {
          name: "github_get_pull_request_diff",
          description: `Reads the whole diff of one pull request of ${repository}.`,
          parameters: numberParameter,
        },
        run: async (context, number) => context.text(pull(number), "application/vnd.github.diff"),
      },
      {
        definition: {
          name: "github_list_pull_request_files",
          description: `Lists the files one pull request of ${repository} changes, with their status and line counts (the first 100).`,
          parameters: numberParameter,
        },
        run: async (context, number) =>
          whole(fileList(await context.json(`${pull(number)}/files?per_page=${listPageSize}`))),
      },
      {
        definition: {
          name: "github_get_pull_request_checks",
          description: `Lists the checks that ran on the head commit of one pull request of ${repository}, with their results.`,
          parameters: numberParameter,
        },
        run: async (context, number) => {
          const sha = headSha(await context.json(pull(number)));
          const runs = await context.json(
            `/repos/${repository}/commits/${sha}/check-runs?per_page=${listPageSize}`,
          );
          return whole(checkList(sha, runs));
        },
      },
    ];
  }

  async #context(signal: AbortSignal): Promise<CallContext> {
    const token = await this.#token();
    const get = async (path: string, accept: string): Promise<Response> => {
      const reply = await this.#fetch(`${githubApi}${path}`, {
        method: "GET",
        redirect: "manual",
        headers: {
          accept,
          authorization: `Bearer ${token}`,
          "x-github-api-version": "2022-11-28",
          "user-agent": "halonic-harness-bridge",
        },
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.#limits.timeoutMs)]),
      });
      if (!reply.ok) throw new GitHubReadError(describeFailure(reply.status));
      return reply;
    };
    const text = async (path: string, accept = "application/vnd.github+json") =>
      readCapped(await get(path, accept), this.#limits.maxResultBytes);
    const json = async (path: string) => {
      const { maxAnswerBytes } = this.#limits;
      const { text: body, cut } = await readCapped(
        await get(path, "application/vnd.github+json"),
        maxAnswerBytes,
      );
      if (cut) {
        throw new GitHubReadError(
          `GitHub's answer is longer than the ${maxAnswerBytes} bytes the bridge reads.`,
        );
      }
      try {
        return JSON.parse(body);
      } catch {
        throw new GitHubReadError("GitHub's answer wasn't what the bridge expects.");
      }
    };
    return { text, json };
  }

  /** The token, which must go in a header as it is: visible ASCII only. */
  async #token(): Promise<string> {
    const { secret, secrets } = this.#options;
    const token = await lookUp(secrets, secret);
    if (token === null) {
      throw new GitHubReadError(`The secret "${secret}" that holds the GitHub token isn't set.`);
    }
    if (!/^[\x21-\x7e]+$/.test(token)) {
      throw new GitHubReadError(`The secret "${secret}" holds something that isn't a token.`);
    }
    return token;
  }

  /** The result: the text cut to the limit, with a note when GitHub's answer or the text was cut. */
  #finish({ text, cut }: ToolOutput): string {
    const { maxResultBytes } = this.#limits;
    const bytes = new TextEncoder().encode(text);
    if (!cut && bytes.length <= maxResultBytes) return text;
    const kept = new TextDecoder().decode(bytes.subarray(0, maxResultBytes));
    return `${kept}\n[Cut: the result was longer than ${maxResultBytes} bytes, and this shows the first ${maxResultBytes}.]`;
  }
}

/** How many items one list call asks GitHub for; a list that fills it says it may be cut. */
const listPageSize = 100;

/**
 * The text of a reply, read only up to `maxBytes`: it stops at the first byte
 * over, without reading the rest into memory.
 */
async function readCapped(reply: Response, maxBytes: number): Promise<ToolOutput> {
  if (reply.body === null) return whole("");
  const reader = reply.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size <= maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  const cut = size > maxBytes;
  if (cut) await reader.cancel();
  const all = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.length;
  }
  return { text: new TextDecoder().decode(all.subarray(0, maxBytes)), cut };
}

/**
 * The secret's value, or `null` when it isn't set. When the store fails, the
 * error names the secret and gives the store's own message, which by the
 * `Secrets` port never holds a value.
 */
async function lookUp(secrets: Secrets, name: string): Promise<string | null> {
  try {
    return await secrets.get(name);
  } catch (error) {
    const cause = error instanceof Error ? error.message : "it failed for an unknown reason";
    throw new GitHubReadError(`The secret "${name}" could not be read: ${cause}`);
  }
}

/** A failure whose text the program may read, because it never holds the token or GitHub's own words. */
class GitHubReadError extends Error {}

/** True for `owner/name`, where neither part is `.` or `..`, which would climb out of the repository's path. */
function isRepository(repository: string): boolean {
  const parts = repository.split("/");
  return (
    parts.length === 2 &&
    parts.every((part) => /^[A-Za-z0-9_.-]+$/.test(part) && part !== "." && part !== "..")
  );
}

function failed(result: string): BridgeToolResult {
  return { result, outcome: "error" };
}

function describeFailure(status: number): string {
  if (status === 401) return "GitHub refused the token (401).";
  if (status === 403)
    return "GitHub refused the call (403): the token may lack access or be rate limited.";
  if (status === 404)
    return "GitHub has no such pull request in this repository, or the token can't see it (404).";
  if (status >= 300 && status < 400)
    return `GitHub answered with a redirect (${status}), which the bridge doesn't follow.`;
  return `GitHub answered with status ${status}.`;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value))
    throw new GitHubReadError("GitHub's answer wasn't what the bridge expects.");
  return value;
}

function asList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value))
    throw new GitHubReadError("GitHub's answer wasn't what the bridge expects.");
  return value.map(asObject);
}

/** The fields of `source` named in `names`, as readable JSON. */
function pick(source: Record<string, unknown>, names: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(names.map((name) => [name, source[name]]));
}

function branch(value: unknown): Record<string, unknown> {
  const { ref, sha } = asObject(value);
  return { ref, sha };
}

function login(value: unknown): unknown {
  return isPlainObject(value) ? value["login"] : null;
}

function pullRequestSummary(value: unknown): string {
  const pull = asObject(value);
  return JSON.stringify(
    {
      ...pick(pull, [
        "number",
        "title",
        "state",
        "draft",
        "merged",
        "mergeable",
        "body",
        "html_url",
      ]),
      author: login(pull["user"]),
      base: branch(pull["base"]),
      head: branch(pull["head"]),
      ...pick(pull, [
        "commits",
        "changed_files",
        "additions",
        "deletions",
        "created_at",
        "updated_at",
      ]),
    },
    null,
    2,
  );
}

function headSha(value: unknown): string {
  const sha = branch(asObject(value)["head"])["sha"];
  if (typeof sha !== "string" || !/^[0-9a-f]{7,64}$/i.test(sha)) {
    throw new GitHubReadError("GitHub's answer wasn't what the bridge expects.");
  }
  return sha;
}

function fileList(value: unknown): string {
  const files = asList(value).map((file) =>
    pick(file, ["filename", "status", "additions", "deletions", "previous_filename"]),
  );
  return JSON.stringify({ files, truncated: files.length >= listPageSize }, null, 2);
}

function checkList(sha: string, value: unknown): string {
  const list = asObject(value);
  const runs = asList(list["check_runs"]).map((run) =>
    pick(run, ["name", "status", "conclusion", "html_url", "started_at", "completed_at"]),
  );
  const total = typeof list["total_count"] === "number" ? list["total_count"] : runs.length;
  return JSON.stringify({ sha, checks: runs, truncated: total > runs.length }, null, 2);
}
