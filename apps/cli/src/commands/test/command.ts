import { MemoryBlobStore, MemoryRunStore } from "@halonicjs/adapter-memory";
import { MockLlmProvider, mockProviderType } from "@halonicjs/adapter-model-mock";
import type { Clock } from "@halonicjs/ports";
import { systemClock } from "@halonicjs/std";
import {
  listWorkspaceTests,
  runWorkspaceTests,
  type TestDeps,
  type TestInput,
} from "@halonicjs/test-runner";
import { loadWorkspace } from "@halonicjs/workspace";
import { type CliCommand, type CommandInput, UsageError } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { testMessages } from "../../messages/test.ts";
import {
  listJson,
  listLines,
  noTestsLines,
  testJson,
  testLines,
} from "../../output/test-report.ts";
import { dirOption, givenDir, openWorkspaceDir, workspaceDir } from "../../workspace-dir.ts";

/** What `halonic test` takes from the computer: only the clock its times are measured with. */
export interface TestSetup {
  readonly clock: Clock;
}

/**
 * `halonic test [--dir <folder>] [--filter <text>] [--list]`, with the clock
 * passed in so tests get the same times on every run.
 */
export function testCommandWith(setup: TestSetup): CliCommand {
  return {
    name: "test",
    usage: "[--dir <folder>] [--filter <text>] [--list]",
    summary: testMessages.summary(),
    action: (input, context) => testMessages.action(actionFolder(input, context.cwd)),
    options: {
      dir: dirOption,
      filter: { type: "string", valueName: "text", description: testMessages.filterOption() },
      list: { type: "boolean", description: testMessages.listOption() },
    },
    async run(input, context) {
      const workspace = await openWorkspaceDir(input, context);
      const loaded = await loadWorkspace(workspace.store);
      const filter = input.options["filter"];
      const tests: TestInput = {
        workspace: loaded,
        textOf: (path) => workspace.store.read(path),
        ...(typeof filter === "string" ? { filter: { contains: filter } } : {}),
      };
      const none = () => {
        if (typeof filter === "string") {
          throw new UsageError(
            testMessages.noMatch(filter),
            testMessages.noMatchFix(givenDir(input, workspace)),
          );
        }
        return { exitCode: exitCode.ok, lines: noTestsLines(workspace.name), json: { cases: [] } };
      };
      if (input.options["list"] === true) {
        const found = await listWorkspaceTests(tests);
        if (found.length === 0) return none();
        return {
          exitCode: exitCode.ok,
          lines: listLines(found, workspace.name),
          json: listJson(found),
        };
      }
      const result = await runWorkspaceTests(tests, testDeps(setup.clock));
      if (result.tests.length === 0) return none();
      return {
        exitCode: result.failed > 0 ? exitCode.failed : exitCode.ok,
        lines: testLines(result, { workspace: workspace.name, loaded }),
        json: testJson(result, loaded),
      };
    },
  };
}

/**
 * `halonic test`: runs the workspace's workflow tests with the test model
 * (cli-output 3.3). It reaches no provider and starts no program, so it needs
 * no trust, no key and no sandbox.
 */
export const testCommand: CliCommand = testCommandWith({ clock: systemClock });

/**
 * What each test case runs with: the test model, which answers from the
 * case's script and with an empty reply once it runs out, as the old runner
 * did, and empty in-memory stores, so nothing is written to the workspace.
 */
function testDeps(clock: Clock): TestDeps {
  return {
    clock,
    model(script) {
      const provider = new MockLlmProvider(mockProviderType, script, () => "");
      return { provider, remaining: () => provider.remaining() };
    },
    stores: () => ({ runs: new MemoryRunStore(), blobs: new MemoryBlobStore() }),
  };
}

/** The folder in "Couldn't test ./downloads": the user's `--dir` as typed, or the current folder's name. */
function actionFolder(input: CommandInput, cwd: string): string {
  const dir = workspaceDir(input, cwd);
  return typeof input.options["dir"] === "string" ? dir.shown : dir.name;
}
