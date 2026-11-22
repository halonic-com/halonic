/**
 * Which `gh` calls the guard answers (HAL-16401, lever L1b on HAL-15920):
 * the status reads of a pull request or a CI run on `halonic`, which the
 * Agent tools answer in one call. Everything else passes to `gh` unchanged:
 * other repositories, writes, and the reads no tool answers (a description,
 * comments, a failure log, another workflow's runs).
 *
 * It reads `gh`'s own arguments, not a shell line, so pipes, `&&` and
 * quoting can't hide a call or make one up.
 */

/** The repositories whose status reads go to the tools: the plugin's default `repos`. */
export const guardedRepos: readonly string[] = ["halonic-com/halonic"];

/** The calls the guard answers, as `<group> <command>`; also the metric's `subcommand` tag. */
export const guardedCommands = [
  "pr view",
  "pr checks",
  "pr list",
  "pr status",
  "run view",
  "run list",
] as const;
export type GuardedCommand = (typeof guardedCommands)[number];

/** A status read the guard answers, with what to call instead. */
export interface StatusCall {
  readonly command: GuardedCommand;
  readonly repo: string;
  /** The pull request's number, when the call named it. */
  readonly pr: number | undefined;
  readonly tool: "pr_status" | "my_prs";
}

/** Where the call's repository comes from besides its own arguments. */
export interface CallContext {
  /** `GH_REPO`, which `gh` reads before the folder's remotes. */
  readonly ghRepo: string | undefined;
  /** The folder's remotes as `name → url`; read only when nothing else names the repository. */
  readonly remotes: () => ReadonlyMap<string, string>;
}

/** Long flags that take a value, per command; short ones map to their long name. */
interface FlagTable {
  readonly values: readonly string[];
  readonly short: Readonly<Record<string, string>>;
}

const output = ["json", "jq", "template"];
const outputShort = { q: "jq", t: "template", R: "repo" };

const flagTables: Readonly<Record<GuardedCommand, FlagTable>> = {
  "pr view": { values: ["repo", ...output], short: { ...outputShort, c: "comments", w: "web" } },
  "pr checks": {
    values: ["repo", "interval", ...output],
    short: { ...outputShort, i: "interval", w: "web" },
  },
  "pr list": {
    values: [
      ...["repo", "app", "assignee", "author", "base", "head", "label", "limit", "search", "state"],
      ...output,
    ],
    short: {
      ...outputShort,
      a: "assignee",
      A: "author",
      B: "base",
      H: "head",
      l: "label",
      L: "limit",
      S: "search",
      s: "state",
      d: "draft",
      w: "web",
    },
  },
  "pr status": { values: ["repo", ...output], short: { ...outputShort, c: "conflict-status" } },
  "run view": {
    values: ["repo", "attempt", "job", ...output],
    short: { ...outputShort, a: "attempt", j: "job", v: "verbose", w: "web" },
  },
  "run list": {
    values: [
      ...["repo", "branch", "commit", "created", "event", "limit", "status", "user", "workflow"],
      ...output,
    ],
    short: {
      ...outputShort,
      b: "branch",
      c: "commit",
      e: "event",
      L: "limit",
      s: "status",
      u: "user",
      w: "workflow",
      a: "all",
    },
  },
};

/** The parsed arguments of one command: flags by long name, then positional arguments. */
interface ParsedArgs {
  readonly flags: ReadonlyMap<string, string | true>;
  readonly positionals: readonly string[];
}

/**
 * Reads one flag argument into `flags`. Returns whether it took the next
 * argument as its value, so the caller skips it.
 */
function readFlag(
  arg: string,
  next: string | undefined,
  table: FlagTable,
  flags: Map<string, string | true>,
): boolean {
  if (arg.startsWith("--")) {
    const [name = "", attached] = splitOnce(arg.slice(2), "=");
    if (attached !== undefined) {
      flags.set(name, attached);
      return false;
    }
    if (!table.values.includes(name)) {
      flags.set(name, true);
      return false;
    }
    flags.set(name, next ?? "");
    return true;
  }
  // A cluster of short flags; one that takes a value takes the rest of the cluster or the next argument.
  for (let at = 1; at < arg.length; at++) {
    const name = table.short[arg.charAt(at)] ?? arg.charAt(at);
    if (!table.values.includes(name)) {
      flags.set(name, true);
      continue;
    }
    const rest = arg.slice(at + 1);
    flags.set(name, rest !== "" ? rest : (next ?? ""));
    return rest === "";
  }
  return false;
}

/** Splits `args` the way `gh`'s flag parser does, for one command's flag table. */
function parseArgs(args: readonly string[], table: FlagTable): ParsedArgs {
  const flags = new Map<string, string | true>();
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? "";
    if (arg === "--") {
      positionals.push(...args.slice(index + 1));
      break;
    }
    if (arg.startsWith("-") && arg.length > 1) {
      if (readFlag(arg, args[index + 1], table, flags)) index += 1;
    } else {
      positionals.push(arg);
    }
  }
  return { flags, positionals };
}

function splitOnce(text: string, separator: string): [string, string | undefined] {
  const at = text.indexOf(separator);
  return at === -1 ? [text, undefined] : [text.slice(0, at), text.slice(at + 1)];
}

/**
 * The `--json` fields `pr_status` answers. A read that asks for any other
 * field (the body, files, comments, reviews, labels) passes through.
 */
const statusFields = new Set([
  ...["number", "title", "url", "state", "isDraft", "closed", "closedAt", "createdAt", "updatedAt"],
  ...["headRefName", "headRefOid", "baseRefName", "author", "additions", "deletions"],
  ...["mergeable", "mergeStateStatus", "statusCheckRollup", "reviewDecision", "isInMergeQueue"],
  ...["autoMergeRequest", "mergedAt", "mergedBy", "mergeCommit", "changedFiles"],
]);

function asksOnlyStatus(flags: ParsedArgs["flags"]): boolean {
  const json = flags.get("json");
  if (typeof json !== "string") return true;
  return json.split(",").every((field) => statusFields.has(field.trim()));
}

/** Whether the guard answers this call, before looking at the repository. */
function isStatusRead(command: GuardedCommand, { flags }: ParsedArgs): boolean {
  if (flags.has("help") || flags.has("h") || flags.has("web")) return false;
  switch (command) {
    case "pr view":
      return !flags.has("comments") && asksOnlyStatus(flags);
    case "pr checks":
    case "pr status":
      return true;
    case "pr list": {
      const state = flags.get("state");
      const filtered = ["search", "head", "label", "base", "assignee", "app"].some((name) =>
        flags.has(name),
      );
      return (state === undefined || state === "open") && !filtered && asksOnlyStatus(flags);
    }
    case "run view":
      return !flags.has("log") && !flags.has("log-failed");
    case "run list":
      return !flags.has("workflow");
  }
}

/** `owner/name` from `[HOST/]OWNER/REPO`, a GitHub URL, or a remote's URL; lower case. */
export function repoName(text: string): string | undefined {
  const match =
    /^(?:[\w.+-]+:\/\/)?(?:[^@/]+@)?(?:[\w.-]+[:/])?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(
      text.trim(),
    );
  return match === null ? undefined : `${match[1]}/${match[2]}`.toLowerCase();
}

/** The remote `gh` picks when nothing names a repository: `upstream`, then `github`, then `origin`. */
function remoteRepo(remotes: ReadonlyMap<string, string>): string | undefined {
  const preferred = ["upstream", "github", "origin"].find((name) => remotes.has(name));
  const url = preferred === undefined ? [...remotes.values()][0] : remotes.get(preferred);
  return url === undefined ? undefined : repoName(url);
}

const pullUrl = /^https?:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)(?:[/?#].*)?$/i;

/** The repository the call reads, the way `gh` picks it. */
function callRepo(parsed: ParsedArgs, context: CallContext): string | undefined {
  const flag = parsed.flags.get("repo");
  if (typeof flag === "string") return repoName(flag);
  const url = parsed.positionals.map((arg) => pullUrl.exec(arg)).find((match) => match !== null);
  if (url?.[1] !== undefined) return url[1].toLowerCase();
  if (context.ghRepo !== undefined && context.ghRepo !== "") return repoName(context.ghRepo);
  return remoteRepo(context.remotes());
}

/** The pull request's number from `123`, `#123` or its URL. */
function pullNumber(positionals: readonly string[]): number | undefined {
  const first = positionals[0];
  if (first === undefined) return undefined;
  const digits = /^#?(\d+)$/.exec(first)?.[1] ?? pullUrl.exec(first)?.[2];
  return digits === undefined ? undefined : Number(digits);
}

/**
 * The status read in `args` (`gh`'s arguments without `gh`), or undefined
 * when `gh` should run it as it is.
 */
export function statusCall(args: readonly string[], context: CallContext): StatusCall | undefined {
  const command = `${args[0] ?? ""} ${args[1] ?? ""}`;
  if (!guardedCommands.includes(command as GuardedCommand)) return undefined;
  const guarded = command as GuardedCommand;
  const parsed = parseArgs(args.slice(2), flagTables[guarded]);
  if (!isStatusRead(guarded, parsed)) return undefined;
  const repo = callRepo(parsed, context);
  if (repo === undefined || !guardedRepos.includes(repo)) return undefined;
  const lists = guarded === "pr list" || guarded === "pr status";
  return {
    command: guarded,
    repo,
    pr: guarded.startsWith("pr ") && !lists ? pullNumber(parsed.positionals) : undefined,
    tool: lists ? "my_prs" : "pr_status",
  };
}
