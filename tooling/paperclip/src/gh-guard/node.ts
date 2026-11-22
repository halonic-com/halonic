import { execFileSync, spawn } from "node:child_process";
import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import type { GuardDeps, PluginAnswer } from "./guard.ts";
import type { GuardedCommand } from "./match.ts";

/**
 * The wrapper's ties to its process: the real `gh` on `PATH`, the folder's
 * remotes, and the plugin's route. Everything that decides lives in
 * `guard.ts` and `match.ts`.
 */

/** The plugin's key; Paperclip finds its routes by it. */
export const pluginKey = "halonic.agent-tools";

/** The longest the wrapper waits for the plugin before it lets `gh` run. */
export const pluginTimeoutMs = 1_500;

/**
 * The first `gh` on `PATH` that isn't this wrapper. Paperclip's GitHub
 * launcher runs the first `gh` after its own folder, so the wrapper sits
 * ahead of the real one (`/usr/local/bin` before `/usr/bin`).
 */
export function realGh(path: string, self: string): string | undefined {
  const own = resolved(self);
  for (const folder of path.split(delimiter)) {
    if (folder === "") continue;
    const candidate = join(folder, "gh");
    if (resolved(candidate) === own) continue;
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Not here; try the next folder.
    }
  }
  return undefined;
}

function resolved(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

/**
 * The folder's remotes as `name → url`, through `git config`, which reads
 * only local files (Paperclip's git launcher lets it through untouched).
 * Outside a repository there are none.
 */
export function folderRemotes(): ReadonlyMap<string, string> {
  try {
    const lines = execFileSync("git", ["config", "--get-regexp", "^remote\\..*\\.url$"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: pluginTimeoutMs,
    });
    const remotes = new Map<string, string>();
    for (const line of lines.split("\n")) {
      const match = /^remote\.(.+)\.url\s+(\S+)$/.exec(line.trim());
      if (match?.[1] !== undefined && match[2] !== undefined) remotes.set(match[1], match[2]);
    }
    return remotes;
  } catch {
    return new Map();
  }
}

/** What the wrapper sends the plugin's `gh-guard` route with. */
export interface PluginRequestEnv {
  readonly apiUrl: string | undefined;
  readonly apiKey: string | undefined;
  readonly companyId: string | undefined;
}

/** The route's address under the API's base, with or without its `/api`. */
export function routeUrl(apiUrl: string, companyId: string): string {
  const base = apiUrl.replace(/\/+$/, "").replace(/\/api$/, "");
  return `${base}/api/plugins/${pluginKey}/api/gh-guard?companyId=${encodeURIComponent(companyId)}`;
}

/**
 * Asks the plugin's `gh-guard` route about one status read, with the run's
 * own Paperclip key. Any failure, a slow answer or one it can't read means
 * "no answer", so `gh` runs.
 */
export function pluginAsker(
  env: PluginRequestEnv,
  fetch: typeof globalThis.fetch,
): (command: GuardedCommand) => Promise<PluginAnswer | undefined> {
  return async (command) => {
    if (!env.apiUrl || !env.apiKey || !env.companyId) return undefined;
    try {
      const response = await fetch(routeUrl(env.apiUrl, env.companyId), {
        method: "POST",
        headers: { authorization: `Bearer ${env.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ subcommand: command }),
        signal: AbortSignal.timeout(pluginTimeoutMs),
      });
      if (!response.ok) return undefined;
      const body = (await response.json()) as { redirect?: unknown };
      return { redirect: body.redirect === true };
    } catch {
      return undefined;
    }
  };
}

/** Runs `gh` at `executable` with the wrapper's input and output, passing on its exit. */
export function ghRunner(executable: string): (args: readonly string[]) => Promise<number> {
  return (args) =>
    new Promise((resolve) => {
      const child = spawn(executable, args, { stdio: "inherit" });
      const forward = (signal: NodeJS.Signals) => child.kill(signal);
      for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, forward);
      child.once("error", () => resolve(127));
      // A `gh` stopped by a signal has no code; 128 tells the shell it didn't finish.
      child.once("exit", (code) => resolve(code ?? 128));
    });
}

/** The guard's dependencies for this process. */
export function processDeps(self: string): GuardDeps | string {
  const env = process.env;
  const executable = realGh(env["PATH"] ?? "", self);
  if (executable === undefined) {
    return "gh-guard: no gh found on PATH after this wrapper.\n";
  }
  return {
    args: process.argv.slice(2),
    agentId: env["PAPERCLIP_AGENT_ID"],
    context: { ghRepo: env["GH_REPO"], remotes: folderRemotes },
    askPlugin: pluginAsker(
      {
        apiUrl: env["PAPERCLIP_API_URL"],
        apiKey: env["PAPERCLIP_API_KEY"],
        companyId: env["PAPERCLIP_COMPANY_ID"],
      },
      globalThis.fetch,
    ),
    runGh: ghRunner(executable),
    writeError: (text) => process.stderr.write(text),
  };
}
