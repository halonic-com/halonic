import type {
  BridgeToolCheck,
  BridgeToolResult,
  BridgeTools,
  Secrets,
  ToolDefinition,
} from "@halonicjs/ports";
import {
  asObject,
  describeFailure,
  failed,
  GitHubToolError,
  githubApi,
  isRepository,
  pick,
  readCapped,
  readToken,
} from "./github-api.ts";
import type { Fetch } from "./pass-through.ts";

/** How long GitHub may take to answer one call, and how much of its answer the bridge reads. */
export interface GitHubWriteLimits {
  timeoutMs: number;
  maxAnswerBytes: number;
}

export const defaultGitHubWriteLimits: GitHubWriteLimits = {
  timeoutMs: 30_000,
  maxAnswerBytes: 2_000_000,
};

export interface GitHubWriteToolsOptions {
  /** The one repository the tools write to, as `owner/name`. The program can't name another. */
  repository: string;
  /**
   * The name of the secret that holds the GitHub token, read from {@link secrets} on each call.
   * It should hold a short-lived token for {@link repository} alone that may only write pull
   * requests: no admin rights and no way past branch protection.
   */
  secret: string;
  secrets: Secrets;
  fetch: Fetch;
  limits?: GitHubWriteLimits;
}

const titleLimit = 256;
const bodyLimit = 65_000;

const openParameters = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: titleLimit },
    body: { type: "string", maxLength: bodyLimit, description: "The description. Markdown." },
    head: { type: "string", description: "The branch that holds the changes, already pushed." },
    base: { type: "string", description: "The branch the changes are meant for." },
    draft: { type: "boolean", description: "Open it as a draft. Defaults to false." },
  },
  required: ["title", "head", "base"],
  additionalProperties: false,
};

const updateParameters = {
  type: "object",
  properties: {
    number: { type: "integer", minimum: 1, description: "The pull request's number." },
    title: { type: "string", minLength: 1, maxLength: titleLimit },
    body: { type: "string", maxLength: bodyLimit, description: "The new description. Markdown." },
  },
  required: ["number"],
  additionalProperties: false,
};

/** One call to GitHub a tool makes, once its arguments passed the checks. */
interface GitHubCall {
  method: "POST" | "PATCH";
  path: string;
  body: Record<string, unknown>;
}

interface ToolSpec {
  definition: ToolDefinition;
  /** The call the arguments stand for. @throws GitHubToolError when the arguments aren't acceptable */
  plan(args: Record<string, unknown>): GitHubCall;
}

/**
 * The tools that write to GitHub for a harness run inside a sandbox that can
 * reach only the bridge (requirement `harness-bridge.github-write`): open a
 * pull request on one repository, and change one's title or description.
 *
 * Writing is outward-facing, so {@link check} sends every call with
 * acceptable arguments to a person; a call with arguments that aren't
 * acceptable is refused without asking anyone. Nothing here can merge, close,
 * delete or release: the tools offer no such call, and the token's rights
 * and the repository's branch protection stay the limit.
 *
 * The token stays here, as in {@link GitHubReadTools}.
 *
 * @example
 * const tools = new GitHubWriteTools({ repository: "halonic-com/halonic", secret: "GITHUB_WRITE_TOKEN", secrets });
 * await tools.check("github_open_pull_request", { title, head, base }); // { kind: "ask" }
 */
export class GitHubWriteTools implements BridgeTools {
  readonly #options: GitHubWriteToolsOptions;
  readonly #fetch: Fetch;
  readonly #limits: GitHubWriteLimits;
  readonly #specs: ToolSpec[];

  /** @throws RangeError when `repository` isn't `owner/name` */
  constructor(options: GitHubWriteToolsOptions) {
    if (!isRepository(options.repository)) {
      throw new RangeError("The repository must be written as owner/name.");
    }
    this.#options = options;
    this.#fetch = options.fetch;
    this.#limits = options.limits ?? defaultGitHubWriteLimits;
    this.#specs = toolSpecs(options.repository);
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
      if (error instanceof GitHubToolError) return { kind: "refused", reason: error.message };
      throw error;
    }
    return { kind: "ask" };
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
      if (error instanceof GitHubToolError) return failed(error.message);
      // Not our own error: its text could quote the request, so the program doesn't read it.
      return failed("GitHub could not be reached.");
    }
  }

  async #send({ method, path, body }: GitHubCall, signal: AbortSignal): Promise<string> {
    const token = await readToken(this.#options.secrets, this.#options.secret);
    const reply = await this.#fetch(`${githubApi}${path}`, {
      method,
      redirect: "manual",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "halonic-harness-bridge",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(this.#limits.timeoutMs)]),
    });
    if (!reply.ok) throw new GitHubToolError(describeFailure(reply.status));
    const { text, cut } = await readCapped(reply, this.#limits.maxAnswerBytes);
    return pullRequestResult(text, cut);
  }
}

function toolSpecs(repository: string): ToolSpec[] {
  return [
    {
      definition: {
        name: "github_open_pull_request",
        description: `Opens a pull request on ${repository}, from a branch already pushed to it. A person approves each call. It can't merge.`,
        parameters: openParameters,
      },
      plan: (args) => ({
        method: "POST",
        path: `/repos/${repository}/pulls`,
        body: openBody(args),
      }),
    },
    {
      definition: {
        name: "github_update_pull_request",
        description: `Changes the title or description of one pull request of ${repository}. A person approves each call. It can't merge or close.`,
        parameters: updateParameters,
      },
      plan: (args) => {
        const { number, ...changes } = updateBody(args);
        return { method: "PATCH", path: `/repos/${repository}/pulls/${number}`, body: changes };
      },
    },
  ];
}

function openBody(args: Record<string, unknown>): Record<string, unknown> {
  rejectUnknown(args, ["title", "body", "head", "base", "draft"]);
  const head = branchName(args["head"], "head");
  const base = branchName(args["base"], "base");
  if (head === base) throw new GitHubToolError("The head and the base must be different branches.");
  const body: Record<string, unknown> = {
    title: text(args["title"], "title", titleLimit),
    head,
    base,
  };
  if (args["body"] !== undefined) body["body"] = text(args["body"], "body", bodyLimit, true);
  if (args["draft"] !== undefined) {
    if (typeof args["draft"] !== "boolean")
      throw new GitHubToolError("The draft must be true or false.");
    body["draft"] = args["draft"];
  }
  return body;
}

function updateBody(args: Record<string, unknown>): { number: number } & Record<string, unknown> {
  rejectUnknown(args, ["number", "title", "body"]);
  const number = args["number"];
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1) {
    throw new GitHubToolError("The number must be a whole number of 1 or more.");
  }
  if (args["title"] === undefined && args["body"] === undefined) {
    throw new GitHubToolError("Give a new title, a new body or both.");
  }
  const changes: { number: number } & Record<string, unknown> = { number };
  if (args["title"] !== undefined) changes["title"] = text(args["title"], "title", titleLimit);
  if (args["body"] !== undefined) changes["body"] = text(args["body"], "body", bodyLimit, true);
  return changes;
}

/** Arguments the tool doesn't know are a mistake, and the one way a program could ask for more than the tool offers. */
function rejectUnknown(args: Record<string, unknown>, known: readonly string[]): void {
  const unknown = Object.keys(args).find((key) => !known.includes(key));
  if (unknown !== undefined)
    throw new GitHubToolError(`The tool has no argument called ${unknown}.`);
}

function text(value: unknown, name: string, limit: number, mayBeEmpty = false): string {
  if (typeof value !== "string" || (!mayBeEmpty && value.trim() === "") || value.length > limit) {
    throw new GitHubToolError(`The ${name} must be text of at most ${limit} characters.`);
  }
  return value;
}

/**
 * A branch of the repository itself: no `owner:` prefix, which would name a
 * fork, and none of what git refuses in a name.
 */
function branchName(value: unknown, name: string): string {
  const ok =
    typeof value === "string" &&
    /^[A-Za-z0-9._/-]{1,200}$/.test(value) &&
    !value.startsWith("/") &&
    !value.startsWith("-") &&
    !value.endsWith("/") &&
    !value.endsWith(".") &&
    !value.endsWith(".lock") &&
    !value.includes("..") &&
    !value.includes("//") &&
    !value.includes("/.");
  if (!ok)
    throw new GitHubToolError(`The ${name} must be the name of a branch of this repository.`);
  return value;
}

/** What the program reads of GitHub's answer: the pull request's number, address and state. */
function pullRequestResult(answer: string, cut: boolean): string {
  if (cut) throw new GitHubToolError("GitHub's answer wasn't what the bridge expects.");
  let pull: Record<string, unknown>;
  try {
    pull = asObject(JSON.parse(answer));
  } catch {
    throw new GitHubToolError("GitHub's answer wasn't what the bridge expects.");
  }
  return JSON.stringify(pick(pull, ["number", "title", "state", "draft", "html_url"]), null, 2);
}
