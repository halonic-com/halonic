import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, test } from "vitest";
import { loadContext } from "../lib/context.ts";
import { checkTrace } from "../rules/trace.ts";
import { manifestFor, removeFixtureRepo, writeFixtureRepo } from "./fixture-repo.ts";

const workflowDirectory = "packages/core/workflow";
const id = "workflow.timer-fires";
const requirementFile = `${workflowDirectory}/requirements/timer-fires.md`;

function requirementText(requirementId: string, since: string): string {
  return `# ${requirementId}

- Status: draft
- Since: ${since}
- Source: HAL-13777

When the delay has passed, the engine shall fire the timer.

## Examples

- Given a timer of 5 minutes, when 5 minutes pass, then it fires.
`;
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    removeFixtureRepo(root);
  }
});

/** A fixture repo with the workflow package and, optionally, the Studio app at a version. */
function fixtureRepo(appVersion?: string): string {
  const root = writeFixtureRepo(
    [
      {
        directory: workflowDirectory,
        manifest: manifestFor("@halonicjs/workflow", "core"),
        files: { "src/index.ts": "export const x = 1;\n" },
      },
    ],
    {
      coreOrder: ["@halonicjs/workflow"],
      extraFiles:
        appVersion === undefined
          ? {}
          : { "apps/studio/package.json": JSON.stringify({ version: appVersion }) },
    },
  );
  roots.push(root);
  return root;
}

function git(root: string, ...args: string[]): void {
  execFileSync(
    "git",
    [
      "-c",
      "user.name=acme",
      "-c",
      "user.email=acme@example.com",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd: root, stdio: "ignore" },
  );
}

/** Commits everything and tags it `v<version>`, as the release bot does. */
function release(root: string, version: string): void {
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", `release ${version}`);
  git(root, "tag", `v${version}`);
}

function write(root: string, file: string, text: string): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}

/** The trace check's findings about `Since`, as `<file>:<line>: <message>`. */
function sinceErrors(root: string): string[] {
  return checkTrace(loadContext(root))
    .problems.filter((problem) => problem.message.includes("Since"))
    .map((problem) => `${problem.file}:${problem.line}: ${problem.message}`);
}

verifies("check.trace-since-is-released", () => {
  describe("Since: unreleased", () => {
    test("passes with release tags", () => {
      const root = fixtureRepo();
      release(root, "0.1.0");
      write(root, requirementFile, requirementText(id, "unreleased"));
      expect(sinceErrors(root)).toEqual([]);
    });

    test("passes without any tag", () => {
      const root = fixtureRepo();
      write(root, requirementFile, requirementText(id, "unreleased"));
      expect(sinceErrors(root)).toEqual([]);
    });
  });

  describe("a version without a tag", () => {
    test("fails and says to write Since: unreleased", () => {
      const root = fixtureRepo("0.1.0");
      release(root, "0.1.0");
      write(root, requirementFile, requirementText(id, "0.3.0"));
      expect(sinceErrors(root)).toEqual([
        `${requirementFile}:4: No tag v0.3.0; write "Since: unreleased".`,
      ]);
    });

    test("says to fetch the tags when the checkout has none", () => {
      const root = fixtureRepo();
      write(root, requirementFile, requirementText(id, "0.1.0"));
      const [error] = sinceErrors(root);
      expect(error).toContain("No tag v0.1.0");
      expect(error).toContain("git fetch --tags");
    });

    test("passes for the app version while its release is being cut", () => {
      const root = fixtureRepo("0.1.0");
      release(root, "0.1.0");
      write(root, "apps/studio/package.json", JSON.stringify({ version: "0.2.0" }));
      write(root, requirementFile, requirementText(id, "0.2.0"));
      expect(sinceErrors(root)).toEqual([]);
    });
  });

  describe("a tagged version", () => {
    test("fails for a requirement written after the tag", () => {
      const root = fixtureRepo();
      release(root, "0.1.0");
      write(root, requirementFile, requirementText(id, "0.1.0"));
      expect(sinceErrors(root)).toEqual([
        `${requirementFile}:4: "${id}" isn't in v0.1.0; write "Since: unreleased".`,
      ]);
    });

    test("passes for a requirement the tag holds at the same path", () => {
      const root = fixtureRepo();
      write(root, requirementFile, requirementText(id, "0.1.0"));
      release(root, "0.1.0");
      expect(sinceErrors(root)).toEqual([]);
    });

    test("passes for a requirement the tag holds under the same ID at another path", () => {
      const root = fixtureRepo();
      // `src/` drops out of the ID, so the file moves and keeps its ID.
      const oldFile = `${workflowDirectory}/src/requirements/timer-fires.md`;
      write(root, oldFile, requirementText(id, "0.1.0"));
      release(root, "0.1.0");
      mkdirSync(dirname(join(root, requirementFile)), { recursive: true });
      renameSync(join(root, oldFile), join(root, requirementFile));
      expect(sinceErrors(root)).toEqual([]);
    });

    test("fails for a requirement whose ID and path are both new", () => {
      const root = fixtureRepo();
      write(root, requirementFile, requirementText(id, "0.1.0"));
      release(root, "0.1.0");
      const newFile = `${workflowDirectory}/requirements/timer-repeats.md`;
      write(root, newFile, requirementText("workflow.timer-repeats", "0.1.0"));
      expect(sinceErrors(root)).toEqual([
        `${newFile}:4: "workflow.timer-repeats" isn't in v0.1.0; write "Since: unreleased".`,
      ]);
    });
  });
});
