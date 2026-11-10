import { plantedHooks, vcsContract } from "@halonicjs/testing-contracts";
import { afterAll } from "vitest";
import { Scratch } from "./fixtures.test-helper.ts";
import type { GitRunner } from "./git-runner.ts";
import { gitVcsHarness, remoteRunner } from "./harness.test-helper.ts";

const scratch = new Scratch();
afterAll(() => scratch.remove());

let runner: Promise<GitRunner> | undefined;
const sharedRunner = (): Promise<GitRunner> => {
  runner ??= remoteRunner(scratch);
  return runner;
};

vcsContract("git", gitVcsHarness(scratch, sharedRunner, plantedHooks));
