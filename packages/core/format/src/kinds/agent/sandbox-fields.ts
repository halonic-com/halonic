// The agent fields that say how a harness agent runs: which program, the one
// folder it writes to and the sites it may reach (requirement
// format.agent-sandbox-fields). They decide what a program on the person's
// computer can touch, so the checks refuse anything that could reach past
// the workspace or past the named sites.
import { s } from "@halonicjs/schema-kit";
import { asciiHost } from "@halonicjs/std";
import { foldName, relativePathProblem } from "../../shared/relative-path.ts";

/**
 * The harnesses an agent can run in: Halonic's own loop, Claude Code or
 * Codex. A closed list, so a typo fails `halonic validate`; each new harness
 * adds a value here.
 */
export const AgentHarness = s.enum(["halonic", "claude-code", "codex"]);

/** The ids of the harnesses an agent can run in, for a caller that checks one outside an agent's file. */
export const AGENT_HARNESSES: readonly string[] = AgentHarness.options;

/** The most sites one agent may name (Julian's cap, HAL-1708). */
export const MAX_ALLOWED_SITES = 50;

/**
 * The first parts of a workspace path that hold definition files or data
 * that isn't the agent's to write: git's own folder, Halonic's reserved
 * folder, every kind's folder, the hubs and the kind files in the workspace
 * root. A test checks that every kind's place is covered, so a new kind
 * can't be missed. They are compared after {@link foldName}.
 */
export const PROTECTED_TOP_NAMES: readonly string[] = [
  ".git",
  ".halonic",
  "agents",
  "deployments.yaml",
  "hub.yaml",
  "hubs",
  "library",
  "models.yaml",
  "providers",
  "runtimes",
  "workflows",
  "workspace.yaml",
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
 * the workspace and doesn't point into a {@link PROTECTED_TOP_NAMES} entry
 * or a top folder whose name starts with `.`: tools such as git, Claude
 * Code, Codex and editors read hooks, commands and tasks from those
 * (`.git`, `.claude`, `.codex`, `.vscode`), and would run them outside the
 * sandbox. Parts that Windows or macOS would read as another name are refused
 * too, in fullwidth forms as well (see {@link relativePathProblem}). Symlinks
 * are resolved later, when the sandbox profile is built.
 *
 * @param path - the `workingFolder` value
 * @returns a message, or `null`
 */
export function workingFolderProblem(path: string): string | null {
  const pathProblem = relativePathProblem(path, { root: "the workspace", part: "folder name" });
  if (pathProblem !== null) return pathProblem;
  const shown = path.split("/")[0] ?? "";
  const top = foldName(path).split("/")[0] ?? "";
  if (PROTECTED_TOP_NAMES.includes(top)) {
    return `The agent can't write in '${shown}': it holds definitions or Halonic's own data`;
  }
  if (top.startsWith(".")) {
    return `The agent can't write in '${shown}': tools read settings and hooks from folders that start with '.'`;
  }
  return null;
}

/**
 * The last labels that name this computer or the local network, not a site
 * on the internet.
 */
const LOCAL_TOP_LABELS: readonly string[] = [
  "arpa",
  "internal",
  "local",
  "localdomain",
  "localhost",
];

/**
 * Why an allowed site can't be used, or `null` when it can. A site is a host
 * name with at least two labels, such as `api.example.com`, or `*.` and a
 * domain with at least two labels, such as `*.example.com`. No address in any
 * notation (a last label starting with a digit, so `127.0x1` too), port,
 * scheme or path, no bare `*`, and no `localhost`, `local`, `localdomain`,
 * `internal` or `arpa` names, which would reach this computer or the local
 * network. Fullwidth forms, ideographic dots, control characters and
 * invisible code points are refused, since a URL parser would map them to
 * another name.
 *
 * @param site - an `allowedSites` entry, in any case and in Unicode or ASCII
 * @returns a message, or `null`
 */
export function allowedSiteProblem(site: string): string | null {
  if (
    /[\p{Cc}\p{Default_Ignorable_Code_Point}\u3002]/u.test(site) ||
    site.normalize("NFKC") !== site.normalize("NFC")
  ) {
    return "Write the host name in plain characters, without fullwidth forms or invisible characters";
  }
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
  const last = labels.at(-1) ?? "";
  if (/^\d/.test(last)) return "Use a host name, not an address";
  if (labels.length < 2) {
    return wildcard
      ? "Name at least two labels after '*.', such as '*.example.com'"
      : "Use a full host name, such as 'api.example.com'";
  }
  if (LOCAL_TOP_LABELS.includes(last)) {
    return `A '.${last}' name would reach this computer or the local network`;
  }
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
