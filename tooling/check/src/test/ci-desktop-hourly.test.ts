import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";

const workflow = readFileSync(
  new URL("../../../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

/** Every job's lines in ci.yml, by job key. */
function jobBlocks(text: string): Map<string, string> {
  const result = new Map<string, string>();
  const jobs = text.slice(text.indexOf("\njobs:\n"));
  let job = "";
  for (const line of jobs.split("\n")) {
    const jobKey = /^ {2}([a-z][a-z0-9-]*):$/.exec(line);
    if (jobKey?.[1]) job = jobKey[1];
    if (job) result.set(job, `${result.get(job) ?? ""}${line}\n`);
  }
  return result;
}

/** A job's top-level `key: value` line, such as its `if`. */
function field(block: string, key: string): string | undefined {
  return new RegExp(`^ {4}${key}: (.+)$`, "m").exec(block)?.[1];
}

/** The macOS and Windows set: what skips in merge groups, and the WSL runtime the installer needs. */
const desktop = [
  "tauri-windows",
  "tauri-keychain-macos",
  "sandbox-fence-macos",
  "sandbox-mxc-fence",
  "sandbox-os",
  "sandbox-windows",
  "wsl-runtime",
  "installer-windows",
  "update-windows",
];

const notOnMainPush =
  " && github.event_name != 'merge_group' && !(github.event_name == 'push' && github.ref == 'refs/heads/main')";
const notHourly = "github.event_name != 'schedule' && github.event_name != 'workflow_dispatch'";

/** Jobs whose condition already names the one event they run on, or that every run needs. */
const ownEvent =
  /^(\$\{\{ (!cancelled\(\) && )?)?github\.event_name == '(pull_request|merge_group|push)'/;
const everyRun = ["changes", "ci-ok", "agent-host"];

verifies("check.ci-desktop-hourly", () => {
  describe("ci.yml runs the macOS and Windows set hourly on main", () => {
    const jobs = jobBlocks(workflow);
    const triggers = workflow.slice(workflow.indexOf("\non:\n"), workflow.indexOf("\njobs:\n"));

    test("starts hourly and by hand, and only a pull request cancels a run in progress", () => {
      expect(triggers).toContain('  schedule:\n    - cron: "5 * * * *"\n');
      expect(triggers).toContain("  workflow_dispatch:\n");
      expect(triggers).toContain(
        `  cancel-in-progress: \${{ github.event_name == 'pull_request' }}\n`,
      );
      for (const [job, block] of jobs) {
        expect(block, job).not.toMatch(/^ {4}concurrency:/m);
      }
    });

    test("each macOS and Windows job skips in a merge group and on a push to main", () => {
      for (const job of desktop) {
        expect(field(jobs.get(job) ?? "", "if")?.endsWith(notOnMainPush), job).toBe(true);
      }
      const onDesktop = [...jobs].filter(([, block]) => {
        const runsOn = field(block, "runs-on") ?? "";
        return (
          /macos-|windows-/.test(runsOn) ||
          (runsOn.includes("matrix.os") && /macos-|windows-/.test(block))
        );
      });
      const linuxForWindows = ["wsl-runtime"];
      expect(onDesktop.map(([job]) => job).sort()).toEqual(
        [...desktop.filter((job) => !linuxForWindows.includes(job)), "agent-host"].sort(),
      );
    });

    test("the agent host builds on Linux only on a push to main, and not in the hourly run", () => {
      const include = /^ {8}include: (.+)$/m.exec(jobs.get("agent-host") ?? "")?.[1] ?? "";
      expect(include).toContain(
        "(github.event_name == 'merge_group' || github.event_name == 'push' && github.ref == 'refs/heads/main') && '[{\"name\":\"Linux\",\"os\":\"ubuntu-24.04\"}]'",
      );
      expect(include).toContain(
        '(github.event_name == \'schedule\' || github.event_name == \'workflow_dispatch\') && \'[{"name":"macOS","os":"macos-15"},{"name":"Windows","os":"windows-2025"}]\'',
      );
    });

    test("every other job skips in the hourly run", () => {
      for (const [job, block] of jobs) {
        if (desktop.includes(job) || everyRun.includes(job)) continue;
        const condition = field(block, "if") ?? "";
        if (ownEvent.test(condition)) continue;
        expect(condition, job).toContain(notHourly);
      }
    });
  });
});
