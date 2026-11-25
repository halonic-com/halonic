import { globSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { areaReports, parseAreaTable } from "./main-failures.ts";
import {
  clickTestPaths,
  needsClickTest,
  nightlyClickTestTitle,
  testedCommit,
} from "./nightly-click-test.ts";
import { findRepoRoot } from "./workspace.ts";

const read = (path: string) => readFileSync(join(findRepoRoot(), path), "utf8");

/** The requirement ids the click test's step files name, read as text: tooling can't import a testing package. */
function stepRequirementIds(): string[] {
  const steps = globSync("packages/testing/studio-click-test/src/steps/*.ts", {
    cwd: findRepoRoot(),
  });
  return steps.flatMap((file) => {
    const list = /requirements: \[([^\]]*)\]/.exec(read(file))?.[1] ?? "";
    return [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "");
  });
}

/** Where each requirement file lives, by its id. */
function requirementFiles(): Map<string, string> {
  const files = globSync("{apps,packages}/**/requirements/*.md", {
    cwd: findRepoRoot(),
    exclude: (path) => basename(path) === "node_modules",
  });
  return new Map(files.map((file) => [/^# (\S+)/.exec(read(file))?.[1] ?? file, file]));
}

verifies("check.nightly-click-test", () => {
  describe("whether tonight's click test runs", () => {
    test("runs when there was no earlier one", () => {
      expect(needsClickTest(undefined)).toBe(true);
    });

    test("is skipped when nothing the installed app is built from changed", () => {
      expect(needsClickTest([])).toBe(false);
      expect(
        needsClickTest([
          "docs/guides/review.md",
          "packages/testing/spec/src/index.ts",
          "packages/targets/cloudflare/worker/src/index.ts",
          "apps/cli/x.ts",
        ]),
      ).toBe(false);
      // A sibling whose name only starts the same doesn't count.
      expect(needsClickTest(["apps/studio-docs/readme.md", "packages/studio.md"])).toBe(false);
    });

    test("runs when the engine, an adapter, the Node target, the click test or the lockfile changed", () => {
      expect(needsClickTest(["packages/core/engine/src/run.ts"])).toBe(true);
      expect(needsClickTest(["packages/adapters/fs-node/src/index.ts"])).toBe(true);
      expect(needsClickTest(["packages/host/server/src/index.ts"])).toBe(true);
      expect(needsClickTest(["packages/targets/node/harness/src/index.ts"])).toBe(true);
      expect(needsClickTest(["packages/testing/studio-click-test/src/steps.ts"])).toBe(true);
      expect(needsClickTest([".github/workflows/studio-preview.yml"])).toBe(true);
      expect(needsClickTest(["pnpm-lock.yaml"])).toBe(true);
    });

    test("covers every requirement a click step names, so a new step's area gets its night", () => {
      const files = requirementFiles();
      const ids = stepRequirementIds();
      expect(ids.length).toBeGreaterThan(0);
      const outside = ids.filter((id) => {
        const file = files.get(id);
        return file === undefined || !clickTestPaths.some((path) => file.startsWith(path));
      });
      expect(outside).toEqual([]);
    });

    test("runs when the Studio, the agent host or a Studio package changed", () => {
      expect(needsClickTest(["apps/studio/src/app.tsx"])).toBe(true);
      expect(needsClickTest(["docs/a.md", "apps/agent-host/src/main.ts"])).toBe(true);
      expect(needsClickTest(["packages/studio/features/runs/src/list.tsx"])).toBe(true);
    });
  });

  describe("the commit the last click test built", () => {
    const sha = "abc1234def5678abc1234def5678abc1234def56";

    test("is read from the run name, not the run's head_sha", () => {
      expect(testedCommit(`Nightly click test of ${sha}`)).toBe(sha);
      expect(testedCommit("Nightly click test of abc1234")).toBe("abc1234");
    });

    test("is undefined when the run name carries no commit", () => {
      expect(testedCommit(nightlyClickTestTitle)).toBeUndefined();
      expect(testedCommit("Studio preview (Windows, unsigned)")).toBeUndefined();
      expect(testedCommit("Nightly click test of main")).toBeUndefined();
    });
  });

  describe("the workflows", () => {
    test("the preview workflow names a nightly run, with its build commit, as the scripts look for it", () => {
      const workflow = read(".github/workflows/studio-preview.yml");
      expect(workflow).toContain(
        `run-name: \${{ inputs.nightly && format('${nightlyClickTestTitle} of {0}', inputs.build-ref) || '' }}`,
      );
    });

    test("the nightly starts it through the script", () => {
      expect(read(".github/workflows/scheduled.yml")).toContain(
        "run: node tooling/check/src/cli/nightly-click-test.ts --apply",
      );
    });
  });

  describe("main-failures", () => {
    const table = parseAreaTable(read("docs/guides/area-owners.md"));

    test("reports a failed nightly click test under Desktop app", () => {
      const jobs = [
        { id: 1, name: "Click through the installed app", conclusion: "failure", url: "u1" },
        {
          id: 2,
          name: "Build and start the unsigned Windows installer",
          conclusion: "failure",
          url: "u2",
        },
        {
          id: 3,
          name: "Publish to halonic-preview as a pre-release",
          conclusion: "skipped",
          url: "u3",
        },
      ];
      const reports = areaReports({ table, latest: { url: "run", jobs }, logs: new Map() });
      const failing = reports.filter((report) => report.failures.length > 0);
      expect(failing.map((report) => [report.area, report.owner, report.slug])).toEqual([
        ["Desktop app", "Mateo", "desktop-app"],
      ]);
      expect(failing[0]?.failures.map((failure) => failure.job)).toEqual([
        "Click through the installed app",
        "Build and start the unsigned Windows installer",
      ]);
    });
  });
});
