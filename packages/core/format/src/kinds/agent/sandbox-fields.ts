// The agent fields that say how a harness agent runs: which program, the one
// folder it writes to and the sites it may reach (requirement
// format.agent-sandbox-fields). They decide what a program on the person's
// computer can touch, so the checks refuse anything that could reach past
// the workspace or past the named sites.
import { s } from "@halonicjs/schema-kit";
import { asciiHost } from "@halonicjs/std";

/**
 * The harnesses an agent can run in: Halonic's own loop, Claude Code or
 * Codex. A closed list, so a typo fails `halonic validate`; each new harness
 * adds a value here.
 */
export const AgentHarness = s.enum(["halonic", "claude-code", "codex"]);

/** The most sites one agent may name (Julian's cap, HAL-1708). */
export const MAX_ALLOWED_SITES = 50;

/**
 * The first parts of a workspace path that hold definition files or data
 * that isn't the agent's to write: git's own folder, Halonic's reserved
 * folder, every kind's folder and the hubs. A test checks that every kind's
 * place is covered, so a new kind can't be missed.
 */
export const PROTECTED_TOP_FOLDERS: readonly string[] = [
  ".git",
  ".halonic",
  "agents",
  "hubs",
  "library",
  "providers",
  "runtimes",
  "workflows",
];

/**
 * The working folder an agent gets when its file names none.
 *
 * @example
 * defaultWorkingFolder("writer"); // "files/agents/writer"
 */
export function defaultWorkingFolder(agentId: string): string {
  return `files/agents/${agentId}`;
}

/**
 * Why a working folder can't be used, or `null` when it can. It must be a
 * path relative to the workspace with `/` between its parts, that stays in
 * the workspace and doesn't point into a {@link PROTECTED_TOP_FOLDERS} folder.
 * Symlinks are resolved later, when the sandbox profile is built.
 *
 * @param path - the `workingFolder` value
 * @returns a message, or `null`
 */
export function workingFolderProblem(path: string): string | null {
  if (path.includes("\\")) return "Use '/' between folders";
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) {
    return "Use a path relative to the workspace";
  }
  const parts = path.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    return "Use a path inside the workspace, without '.', '..' or empty parts";
  }
  const top = parts[0] ?? "";
  if (PROTECTED_TOP_FOLDERS.includes(top)) {
    return `The agent can't write in '${top}': it holds definitions or Halonic's own data`;
  }
  return null;
}

/**
 * Why an allowed site can't be used, or `null` when it can. A site is a host
 * name with at least two labels, such as `api.example.com`, or `*.` and a
 * domain with at least two labels, such as `*.example.com`. No address,
 * port, scheme or path, no bare `*`, and no `localhost` names, which would
 * reach this computer.
 *
 * @param site - an `allowedSites` entry, in any case and in Unicode or ASCII
 * @returns a message, or `null`
 */
export function allowedSiteProblem(site: string): string | null {
  const host = asciiHost(site);
  const wildcard = host.startsWith("*.");
  const name = wildcard ? host.slice(2) : host;
  if (host === "*") return "Name a domain after '*.', such as '*.example.com'";
  if (/[:/@?#\s[\]]/.test(name) || name.includes("*")) {
    return "Write only a host name, such as 'api.example.com', without a scheme, port or path";
  }
  const labels = name.split(".");
  if (!labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    return "Use a host name of letters, digits, '-' and '.'";
  }
  if (name.length > 253) return "Use a host name of at most 253 characters";
  if (/^\d+$/.test(labels.at(-1) ?? "")) return "Use a host name, not an address";
  if (labels.length < 2) {
    return wildcard
      ? "Name at least two labels after '*.', such as '*.example.com'"
      : "Use a full host name, such as 'api.example.com'";
  }
  if (labels.at(-1) === "localhost") return "A localhost name would reach this computer";
  return null;
}

/**
 * The allowed sites in the form the sandbox and the trust prompt use:
 * lowercase, in ASCII (Punycode) and each once, in the order first named.
 *
 * @example
 * asciiAllowedSites(["API.Example.com", "bücher.example", "api.example.com"]);
 * // => ["api.example.com", "xn--bcher-kva.example"]
 */
export function asciiAllowedSites(sites: readonly string[]): string[] {
  return [...new Set(sites.map(asciiHost))];
}

/** The `workingFolder` field: a folder in the workspace the agent may write to. */
export const WorkingFolder = s.string().superRefine((path, context) => {
  const problem = workingFolderProblem(path);
  if (problem !== null) context.addIssue({ code: "custom", message: problem });
});

/** One `allowedSites` entry: a host name, or `*.` and a domain. */
export const AllowedSite = s.string().superRefine((site, context) => {
  const problem = allowedSiteProblem(site);
  if (problem !== null) context.addIssue({ code: "custom", message: problem });
});
