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
  /** The most text one result holds; a longer one is cut and says so. */
  maxResultBytes: number;
}

export const defaultGitHubReadLimits: GitHubReadLimits = {
  timeoutMs: 30_000,
  maxResultBytes: 200_000,
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

interface ToolSpec {
  definition: ToolDefinition;
  run(context: CallContext, number: number): Promise<string>;
}

interface CallContext {
  get(path: string, accept?: string): Promise<Response>;
  json(path: string): Promise<unknown>;
}

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
      const text = await spec.run(await this.#context(options.signal), number);
      return { result: this.#cut(text), outcome: "ok" };
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
        run: async (context, number) => pullRequestSummary(await context.json(pull(number))),
      },
      {
        definition: {
          name: "github_get_pull_request_diff",
          description: `Reads the whole diff of one pull request of ${repository}.`,
          parameters: numberParameter,
        },
        run: async (context, number) =>
          (await context.get(pull(number), "application/vnd.github.diff")).text(),
      },
      {
        definition: {
          name: "github_list_pull_request_files",
          description: `Lists the files one pull request of ${repository} changes, with their status and line counts (the first 100).`,
          parameters: numberParameter,
        },
        run: async (context, number) =>
          fileList(await context.json(`${pull(number)}/files?per_page=100`)),
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
            `/repos/${repository}/commits/${sha}/check-runs?per_page=100`,
          );
          return checkList(sha, runs);
        },
      },
    ];
  }

  async #context(signal: AbortSignal): Promise<CallContext> {
    const token = await this.#token();
    const get = async (path: string, accept = "application/vnd.github+json") => {
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
    return { get, json: async (path) => (await get(path)).json() };
  }

  /** The token, which must go in a header as it is: visible ASCII only. */
  async #token(): Promise<string> {
    const { secret, secrets } = this.#options;
    const token = await secrets.get(secret);
    if (token === null) {
      throw new GitHubReadError(`The secret "${secret}" that holds the GitHub token isn't set.`);
    }
    if (!/^[\x21-\x7e]+$/.test(token)) {
      throw new GitHubReadError(`The secret "${secret}" holds something that isn't a token.`);
    }
    return token;
  }

  #cut(text: string): string {
    const bytes = new TextEncoder().encode(text);
    if (bytes.length <= this.#limits.maxResultBytes) return text;
    const kept = new TextDecoder().decode(bytes.subarray(0, this.#limits.maxResultBytes));
    return `${kept}\n[Cut: the result was ${bytes.length} bytes, and this shows the first ${this.#limits.maxResultBytes}.]`;
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
  return JSON.stringify(files, null, 2);
}

function checkList(sha: string, value: unknown): string {
  const runs = asList(asObject(value)["check_runs"]).map((run) =>
    pick(run, ["name", "status", "conclusion", "html_url", "started_at", "completed_at"]),
  );
  return JSON.stringify({ sha, checks: runs }, null, 2);
}
