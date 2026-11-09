import { fixedClock, fixedIds } from "@halonicjs/std";
import { clockContract, idGeneratorContract } from "../src/index.ts";

/**
 * Registers a contract suite for each of two adapters and names them. Call it
 * at the top level of a `*.test.ts` file: each suite adds its cases to the
 * test run there, so an adapter that breaks its port's promises fails the run.
 */
export function runExample(): string[] {
  // `make` builds a fresh adapter for every case; any setup it needs, such as a clock, goes in here.
  clockContract("std fixedClock", async () => fixedClock());
  idGeneratorContract("std fixedIds", async () => fixedIds());
  return ["Clock contract: std fixedClock", "IdGenerator contract: std fixedIds"];
}
