import { parseArgs } from "node:util";
import { gitHubReader } from "../pr-watcher/github.ts";
import { paperclipClient } from "../pr-watcher/paperclip.ts";
import { tick } from "../pr-watcher/watch.ts";

/**
 * pnpm exec node tooling/paperclip/src/cli/pr-watcher.ts [--dry-run]
 *
 * One pass of the PR watcher, run by its Paperclip agent every 10 minutes.
 * Reads GH_TOKEN for GitHub (read-only) and the PAPERCLIP_* variables the
 * agent's run gets. `--dry-run` prints what it would do and writes nothing.
 */

const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });

const env = process.env;
const missing = [
  "PAPERCLIP_API_URL",
  "PAPERCLIP_API_KEY",
  "PAPERCLIP_COMPANY_ID",
  "PAPERCLIP_AGENT_ID",
].filter((name) => (env[name] ?? "") === "");
if (missing.length > 0) {
  console.error(`pr-watcher: set ${missing.join(", ")} (a Paperclip run sets them).`);
  process.exitCode = 2;
} else {
  const summary = await tick({
    paperclip: paperclipClient({
      fetch,
      apiUrl: env["PAPERCLIP_API_URL"] ?? "",
      apiKey: env["PAPERCLIP_API_KEY"] ?? "",
      companyId: env["PAPERCLIP_COMPANY_ID"] ?? "",
      runId: env["PAPERCLIP_RUN_ID"],
    }),
    get: gitHubReader({ fetch, token: env["GH_TOKEN"] }),
    selfId: env["PAPERCLIP_AGENT_ID"] ?? "",
    dryRun: values["dry-run"],
    log: (line) => console.log(line),
  });
  console.log(
    `pr-watcher: ${summary.checked} tasks with a pull request, ${summary.done} done, ${summary.woken} woken, ${summary.failed.length} failed.`,
  );
  if (summary.failed.length > 0) {
    process.exitCode = 1;
  }
}
