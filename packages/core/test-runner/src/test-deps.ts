// What the test runner is given. It has no adapters of its own: the caller
// passes the scripted model, the stores and the clock.

import type { HalonicTool } from "@halonicjs/engine";
import type { WorkflowTestCase } from "@halonicjs/format";
import type { BlobStore, Clock, LlmProvider, RunStore } from "@halonicjs/ports";
import type { LoadedWorkspace } from "@halonicjs/workspace";

/** A case's scripted model replies: per agent id, used in order. */
export type ModelScript = WorkflowTestCase["mocks"];

/** The model a test case's runs talk to, made from its script. */
export interface ScriptedModel {
  readonly provider: LlmProvider;
  /** The replies not used yet, per agent id; agents with none left may be absent. */
  remaining(): Readonly<Record<string, number>>;
}

/** What {@link TestDeps.stores} gives each test case: empty stores of its own. */
export interface TestStores {
  readonly runs: RunStore;
  readonly blobs: BlobStore;
}

/** What the runner works with. Everything comes in here. */
export interface TestDeps {
  /**
   * Where each case's test clock starts, and what test durations are
   * measured with. The test clock then moves only on `{ advance }`.
   */
  readonly clock: Clock;
  /** The model for one case, every agent and alias of the case's runs uses it. */
  model(script: ModelScript): ScriptedModel;
  /** Fresh stores for one case. */
  stores(): TestStores;
  /** Halonic's own tools the runs offer, such as knowledge search. None when left out. */
  readonly halonicTools?: readonly HalonicTool[];
}

/**
 * Which tests to run. The runner keeps a case only when every part that is
 * set equals the case's own, exactly. It never parses a filter: turning
 * `halonic test --filter` into these parts is the CLI's job.
 */
export interface TestFilter {
  readonly hub?: string;
  readonly workflow?: string;
  /** The case's `name` as the test file has it. */
  readonly name?: string;
}

/** The workspace whose tests run. */
export interface TestInput {
  readonly workspace: LoadedWorkspace;
  /**
   * A test file's text, for the line of each case, as `DefinitionSource.read`
   * gives it. Without it, or when it gives `null`, results have no lines.
   */
  textOf?(path: string): Promise<string | null>;
  readonly filter?: TestFilter;
}

/** One test case as `halonic test --list` shows it, without running it. */
export interface TestCaseRef {
  readonly hub: string;
  readonly workflow: string;
  readonly name: string;
  readonly file: string;
  readonly line?: number;
}
