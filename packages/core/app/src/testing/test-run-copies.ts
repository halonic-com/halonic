import type { Sha256 } from "@halonicjs/std";
import type { RunCopies } from "../run-proposal-copy-texts.ts";
import { TestDefinitionStore } from "./memory-definition-store.ts";

/** Where {@link TestRunCopies} says a run's copy is. */
const root = "/data/run-copies";

/**
 * The runs' copies with history off, in memory, for the kernel's tests:
 * two stores per run. A test changes the `run` side's files as a run would,
 * through {@link filesOf}.
 */
export class TestRunCopies implements RunCopies {
  readonly copies = new Map<
    string,
    { readonly base: TestDefinitionStore; readonly run: TestDefinitionStore }
  >();
  private readonly digest: Sha256;

  constructor(digest: Sha256) {
    this.digest = digest;
  }

  /** The `run` side's files, for a test to change as a run would. */
  filesOf(folder: string): Map<string, string> {
    const runId = folder.replace(`${root}/`, "").replace(/\/run$/u, "");
    return this.sideOf(runId, "run").files;
  }

  async create(runId: string): Promise<void> {
    this.copies.set(runId, {
      base: new TestDefinitionStore({}, this.digest),
      run: new TestDefinitionStore({}, this.digest),
    });
  }

  store(runId: string, side: "base" | "run"): TestDefinitionStore {
    return this.sideOf(runId, side);
  }

  folderOf(runId: string): string {
    return `${root}/${runId}/run`;
  }

  async remove(runId: string): Promise<void> {
    this.copies.delete(runId);
  }

  async list(): Promise<string[]> {
    return [...this.copies.keys()].sort();
  }

  private sideOf(runId: string, side: "base" | "run"): TestDefinitionStore {
    const copy = this.copies.get(runId);
    if (copy === undefined) {
      throw new Error(`Run ${runId} has no copy.`);
    }
    return copy[side];
  }
}
