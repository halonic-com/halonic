import { plantedHooks } from "@halonicjs/testing-contracts";
import { afterAll } from "vitest";
import { Scratch } from "./fixtures.test-helper.ts";
import type { GitRunner } from "./git-runner.ts";
import { gitVcsHarness, type MakeGitVcs, remoteRunner } from "./harness.test-helper.ts";

/**
 * The contract suite's folders on real git, for one test file: each file
 * that runs a part of the Vcs contract calls this once. The parts are in
 * several files so the test runner spreads them over its workers (HAL-15905).
 * The file's scratch folders go when its tests are done.
 */
export function gitContractHarness(): MakeGitVcs {
  const scratch = new Scratch();
  afterAll(() => scratch.remove());

  let runner: Promise<GitRunner> | undefined;
  const sharedRunner = (): Promise<GitRunner> => {
    runner ??= remoteRunner(scratch);
    return runner;
  };

  return gitVcsHarness(scratch, sharedRunner, plantedHooks);
}
