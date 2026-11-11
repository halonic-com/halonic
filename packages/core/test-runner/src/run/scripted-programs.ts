// Programs that answer from a test case's script: tests never start a real
// program, open a sandbox or serve a bridge.

import type { LocalExecutorOptions, ProgramHarness } from "@halonicjs/engine";
import type { WorkflowTestCase } from "@halonicjs/format";
import type {
  Harness,
  HarnessEvent,
  HarnessRun,
  HarnessTask,
  Sandbox,
  SandboxProfile,
} from "@halonicjs/ports";
import type { TestFailure } from "../test-result.ts";

/** A case's scripted program results: per agent id, used in order. */
type ProgramScript = NonNullable<WorkflowTestCase["programs"]>;
type ProgramResult = ProgramScript[string][number];

/** What the engine needs to carry out `run-harness` effects. */
type HarnessRunsOptions = NonNullable<NonNullable<LocalExecutorOptions["runs"]>["harnesses"]>;

/** A program start that had no scripted result left: the run and the agent it was for. */
export interface UnscriptedProgram {
  readonly runId: string;
  readonly agent: string;
}

/** The program harnesses an agent's file can name; each one answers from the same script. */
const harnessNames: Readonly<Record<ProgramHarness, string>> = {
  "claude-code": "Claude Code",
  codex: "Codex",
};

/**
 * The scripted program results of one test case, and the harness ports
 * that hand them out in order, per agent. The program's prompt is never
 * matched: the next result is the agent's next one.
 */
export class ScriptedPrograms {
  readonly #queues: Map<string, ProgramResult[]>;
  readonly #unscripted: UnscriptedProgram[] = [];

  constructor(script: ProgramScript = {}) {
    this.#queues = new Map(Object.entries(script).map(([agent, results]) => [agent, [...results]]));
  }

  /**
   * What the engine needs to carry out a `run-harness` effect: harnesses
   * that answer from the script, behind a sandbox that is always ready and
   * starts nothing, and a bridge that serves nothing.
   */
  harnesses(): HarnessRunsOptions {
    const harnesses = Object.fromEntries(
      Object.entries(harnessNames).map(([id, name]) => [id, this.#harness(id, name)]),
    );
    return {
      placement: { where: async () => ({ runsOn: "sandbox" }) },
      sandboxes: { sandbox: scriptedSandbox, "this-computer": scriptedSandbox },
      harnesses,
      bridges: {
        open: async () => ({ url: "http://127.0.0.1:0", token: "", close: async () => {} }),
      },
      profiles: { profileOf: async () => ({ profile: scriptedProfile, deniedGroups: [] }) },
      home: null,
    };
  }

  /** The program starts that had no result left, in the order they started. */
  unscripted(): readonly UnscriptedProgram[] {
    return this.#unscripted;
  }

  /** The scripted results left over, one failure per agent, in the order the script names them. */
  failures(): TestFailure[] {
    return [...this.#queues]
      .filter(([, left]) => left.length > 0)
      .map(([agent, left]) => ({ kind: "unused-program-results", agent, count: left.length }));
  }

  #harness(id: string, name: string): Harness {
    return {
      id,
      name,
      detect: async () => ({ status: "ready", version: "scripted" }),
      start: (task) => this.#start(task),
    };
  }

  /**
   * One program start: it finishes with the agent's next result, or fails
   * with its message. With no result left, it doesn't start, and the start
   * is noted for `unscripted-program`.
   */
  #start(task: HarnessTask): HarnessRun {
    const result = this.#queues.get(task.agentId)?.shift();
    if (result === undefined) this.#unscripted.push({ runId: task.runId, agent: task.agentId });
    return {
      async *[Symbol.asyncIterator](): AsyncGenerator<HarnessEvent> {
        if (result === undefined) {
          throw new Error(`No scripted program result for agent "${task.agentId}".`);
        }
        // The engine skips the agent's own `agent.started`. Sent first, it
        // shows the program started, so a failure after it keeps its message.
        yield { type: "agent.started", agent: task.agentId, prompt: task.prompt };
        if (typeof result === "object" && "fails" in result) throw new Error(result.fails);
        const output = typeof result === "string" ? result : result.output;
        yield { type: "agent.finished", agent: task.agentId, output };
      },
      send: async () => {
        throw new Error("A scripted program asks for nothing.");
      },
      cancel: async () => {},
    };
  }
}

/** The profile of a scripted program's sandbox: it reaches nothing, and nothing runs in it. */
const scriptedProfile: SandboxProfile = {
  workingFolder: "<test>",
  tempFolder: "<test>",
  settingsFolder: null,
  readOnlyPaths: [],
  deniedPaths: [],
  env: {},
  network: { bridge: { host: "127.0.0.1", port: 0 }, allowedSites: [] },
  timeLimitMs: 600_000,
};

/** A sandbox that is always ready and starts no program: the scripted harness never asks it to. */
const scriptedSandbox: Sandbox = {
  check: async () => ({ ok: true, reason: null, missing: [] }),
  capabilities: () => ({ files: "shared", strength: "os" }),
  open: async (profile) => ({
    profile,
    fence: { state: "fenced" },
    start: async () => {
      throw new Error("A scripted program's sandbox starts no program.");
    },
    onBlocked: () => () => {},
    close: async () => {},
  }),
};
