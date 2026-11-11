// Acceptance (HAL-1541, HAL-186 step 8): the base parity fixture's 8
// workflow tests, run through runWorkspaceTests with the clock and IDs the
// old runner had, give the old runner's run logs, apart from the allowed
// differences and the known gaps. The compare, the rules and both lists live
// in testing-parity; this file only feeds it the runner's results.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { KnowledgeProviderContext, KnowledgeProviderFactory } from "@halonicjs/ports";
import {
  allowedDifferencesFile,
  fixedTestTime,
  judgeRunLogs,
  knownGapsFile,
  listFiles,
  pairRunLogs,
  readAllowedDifferences,
  readKnownGaps,
  readRunLogs,
} from "@halonicjs/testing-parity";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { runWorkspaceTests } from "./run-tests.ts";
import { fakeDeps } from "./test/fakes.ts";
import { MemorySource } from "./test/memory-source.ts";
import type { TestKnowledge } from "./test-deps.ts";

/** The parity package's base fixture: a made-up workspace with every file kind and 8 workflow tests. */
const base = join(import.meta.dirname, "..", "..", "..", "testing", "parity", "fixtures", "base");

function baseSource(): MemorySource {
  const folder = join(base, "files");
  const files: Record<string, string> = {};
  for (const path of listFiles(folder)) files[path] = readFileSync(join(folder, path), "utf8");
  return new MemorySource(files);
}

/**
 * The base's knowledge sources use the `files` type over folders the fixture
 * doesn't have, so the old runner's searches found nothing; this one finds
 * nothing too, and reaches no disk.
 */
const emptyFiles: KnowledgeProviderFactory = {
  type: "files",
  create: (source) => ({
    id: source.id,
    capabilities: { search: true, semantic: false, ingest: false },
    search: async () => [],
    get: async () => null,
  }),
};

const knowledge: TestKnowledge = {
  factories: [emptyFiles],
  contextOf: (hubId): KnowledgeProviderContext => ({
    store: {
      location: "memory:parity",
      list: async () => [],
      read: async () => null,
      version: async () => "v1",
    },
    basePath: `hubs/${hubId}`,
    http: {
      fetch: async () => {
        throw new Error("The parity run doesn't go online.");
      },
    },
    secrets: { get: async () => null },
  }),
};

const golden = readRunLogs(base);
const source = baseSource();
const suite = await runWorkspaceTests(
  { workspace: await loadWorkspace(source), textOf: (path) => source.read(path) },
  fakeDeps({ clock: { now: () => new Date(golden.clock) }, knowledge }),
);
const report = judgeRunLogs(
  pairRunLogs(golden, suite.tests),
  readAllowedDifferences(allowedDifferencesFile),
  readKnownGaps(knownGapsFile),
);

verifies("test-runner.parity-run-logs", () => {
  it("runs the base's 8 workflow tests from the old runner's fixed time", () => {
    expect(golden.clock).toBe(fixedTestTime);
    expect(suite.tests.map((test) => test.name)).toEqual(golden.tests.map((test) => test.name));
    expect(suite).toMatchObject({ passed: 8, failed: 0 });
  });

  it("has no difference that isn't allowed or a known gap, and no stale rule or gap", () => {
    expect(report.unexplained.map((result) => ({ test: result.test, ...result.ruled }))).toEqual(
      [],
    );
    expect(report.stale).toEqual([]);
  });

  it("still differs only by the known gaps, each with its task", () => {
    // Every base test starts a workflow with an initial context, so each
    // stays a gap until initial-context-unlogged is fixed.
    expect(report.results.map((result) => [result.test, result.verdict])).toEqual(
      golden.tests.map((test) => [`${test.hub}/${test.workflow}/${test.name}`, "gap"]),
    );
  });

  it.each(report.results)("judges $test", (result) => {
    expect(result.verdict).not.toBe("different");
  });
});
