import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import {
  areaOfJob,
  areaOfPath,
  areaReports,
  failedFolders,
  fallbackArea,
  issueBody,
  type Job,
  parseAreaTable,
  slugOf,
} from "./main-failures.ts";
import { findRepoRoot } from "./workspace.ts";

const table = parseAreaTable(
  readFileSync(join(findRepoRoot(), "docs/guides/area-owners.md"), "utf8"),
);

let nextId = 1;
function job(name: string, conclusion = "failure"): Job {
  const id = nextId++;
  return { id, name, conclusion, url: `https://example.test/job/${id}` };
}

function failingAreas(jobs: Job[], logs = new Map<number, string>()): Record<string, string[]> {
  const reports = areaReports({ table, latest: { url: "run", jobs }, logs });
  return Object.fromEntries(
    reports
      .filter((report) => report.failures.length > 0)
      .map((report) => [report.area, report.failures.map((failure) => failure.job)]),
  );
}

verifies("check.main-failures", () => {
  describe("the area table", () => {
    test("reads every area, its owner and its paths from the guide", () => {
      const names = table.areas.map((area) => area.name);
      expect(names).toContain("Sandbox");
      expect(names.at(-1)).toBe(fallbackArea);
      expect(table.areas.find((area) => area.name === "Studio")?.owner).toBe("Elena");
    });

    test("routes a file to the first area whose paths match", () => {
      expect(areaOfPath("packages/adapters/sandbox-bwrap/src/a.ts", table)).toBe("Sandbox");
      expect(areaOfPath("packages/adapters/fs-node/src/a.ts", table)).toBe("Adapters");
      expect(areaOfPath("pnpm-lock.yaml", table)).toBe("Tooling and CI");
      expect(areaOfPath("packages/core/ports/src/a.ts", table)).toBe(fallbackArea);
    });

    test("matches a matrix job by its name before the brackets", () => {
      expect(areaOfJob("Agent host executable (macOS)", table)).toBe("Adapters");
      expect(areaOfJob("Sandbox packages on Windows", table)).toBe("Sandbox");
      expect(areaOfJob("Sandbox fence (bubblewrap)", table)).toBe("Sandbox");
      expect(areaOfJob("Windows installer (build, install, uninstall)", table)).toBe(
        "Tooling and CI",
      );
      expect(areaOfJob("android-screens.yml", table)).toBe("Studio");
      expect(areaOfJob("Agent host", table)).toBeUndefined();
    });

    test("names every job of a failed run on main that isn't in the table", () => {
      const named = [
        "Leak guard",
        "Policy rules (base commit's copy)",
        "Changed areas",
        "Coverage floors don't go down",
        "Secret scan (gitleaks)",
        "Fast gates",
        "Live cloud suites passed",
        "Empty package and feature pass every check",
        "Tauri shell on Windows (build and tests)",
        "Keychain contract on macOS",
        "Tauri shell (Rust checks)",
        "Sandbox fence (Seatbelt)",
        "Android shell (debug APK)",
        "Workflow lint (zizmor)",
        "Studio end-to-end (Playwright)",
        "Sandbox fence (MXC on Windows 11)",
        "Sandbox packages on macOS",
        "Docs build and link check",
        "Windows update (0.1.0 to 0.1.1)",
        "Sandbox fence on Windows (canary probes)",
        "Requirements and the requirement guard (merge base's copy)",
      ];
      expect(named.filter((name) => areaOfJob(name, table) === undefined)).toEqual([]);
    });

    test("refuses a jobs row that names an unknown area", () => {
      const text = [
        "## Areas",
        "",
        "| Area | Owner | Paths |",
        "| --- | --- | --- |",
        `| ${fallbackArea} | Liam | anything |`,
        "",
        "## CI jobs",
        "",
        "| Area | Jobs | Other |",
        "| --- | --- | --- |",
        "| Nowhere | Fast gates | |",
      ].join("\n");
      expect(() => parseAreaTable(text)).toThrow(/unknown area "Nowhere"/);
    });
  });

  describe("failedFolders", () => {
    test("reads the folder of each failed turbo task", () => {
      const log = [
        "2026-11-18T00:48:01Z ##[error]command (/runner/work/halonic/halonic/packages/studio/features/source-control) /usr/bin/pnpm run test exited (1)",
        "2026-11-18T00:48:01Z @halonicjs/studio-feature-source-control#test:  ERROR  command (/runner/work/halonic/halonic/packages/studio/features/source-control) /usr/bin/pnpm run test exited (1)",
        "2026-11-18T00:48:02Z command (/runner/work/halonic/halonic/base/apps/cli) pnpm run test exited (2)",
        " ERROR  run failed: command  exited (1)",
      ].join("\n");
      expect(failedFolders(log)).toEqual(["apps/cli", "packages/studio/features/source-control"]);
    });
  });

  describe("areaReports", () => {
    test("routes a job that tests every package by the failing package", () => {
      const build = job("Typecheck, lint, test, build");
      const logs = new Map([
        [
          build.id,
          "command (/runner/work/halonic/halonic/packages/studio/features/source-control) pnpm run test exited (1)",
        ],
      ]);
      expect(failingAreas([build], logs)).toEqual({ Studio: ["Typecheck, lint, test, build"] });
    });

    test("routes a shard of the build job by the failing package too", () => {
      const shard = job("Typecheck, lint, test, build (adapters)");
      const logs = new Map([
        [
          shard.id,
          "command (/runner/work/halonic/halonic/packages/studio/features/source-control) pnpm run test exited (1)",
        ],
      ]);
      expect(failingAreas([shard], logs)).toEqual({
        Studio: ["Typecheck, lint, test, build (adapters)"],
      });
    });

    test("sends a job whose log names no package, or that isn't in the table, to the shared-code area", () => {
      expect(failingAreas([job("Typecheck, lint, test, build"), job("Something new")])).toEqual({
        [fallbackArea]: ["Typecheck, lint, test, build", "Something new"],
      });
    });

    test("leaves out ci-ok and jobs that passed, were skipped or cancelled", () => {
      expect(
        failingAreas([
          job("ci-ok"),
          job("Fast gates", "success"),
          job("Leak guard", "skipped"),
          job("Docs build and link check", "cancelled"),
        ]),
      ).toEqual({});
      expect(failingAreas([job("Docs build and link check", "timed_out")])).toEqual({
        Docs: ["Docs build and link check"],
      });
    });

    test("marks a job that also failed in the same area the night before", () => {
      const reports = areaReports({
        table,
        latest: { url: "run", jobs: [job("Sandbox fence (bubblewrap)"), job("Fast gates")] },
        earlier: {
          url: "earlier",
          jobs: [job("Sandbox fence (bubblewrap)"), job("Fast gates", "success")],
        },
        logs: new Map(),
      });
      const failures = reports.flatMap((report) => report.failures);
      expect(failures.map((failure) => [failure.job, failure.secondNight])).toEqual([
        ["Sandbox fence (bubblewrap)", true],
        ["Fast gates", false],
      ]);
      expect(reports.find((report) => report.area === "Sandbox")?.slug).toBe("sandbox");
    });

    test("reports every area, so a green one can be closed", () => {
      expect(
        areaReports({ table, latest: { url: "run", jobs: [] }, logs: new Map() }),
      ).toHaveLength(table.areas.length);
    });
  });

  describe("issueBody", () => {
    test("names the owner and the pause when a job failed two nights in a row", () => {
      const body = issueBody(
        {
          area: "Sandbox",
          owner: "Julian",
          slug: "sandbox",
          failures: [
            { job: "Sandbox fence (bubblewrap)", url: "https://x.test/1", secondNight: true },
          ],
        },
        "https://x.test/run",
      );
      expect(body).toContain("Owner: Julian");
      expect(body).toContain(
        "[Sandbox fence (bubblewrap)](https://x.test/1) (second night in a row)",
      );
      expect(body).toContain("merges pause");
    });

    test("gives each area a label-safe slug", () => {
      expect(slugOf("Engine and CLI")).toBe("engine-and-cli");
      expect(slugOf(fallbackArea)).toBe("shared-code-and-everything-else");
    });
  });
});
