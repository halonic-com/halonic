import fc from "fast-check";
import { describe, it } from "vitest";
import { inputFor, type Noise } from "./test/arbitrary.ts";
import { expectSameOutcome } from "./test/compare.ts";
import { type SchemaNode, schemaNode } from "./test/schema-tree.ts";
import { buildKit, buildZod } from "./test/schema-tree-build.ts";

// A fixed seed keeps runs repeatable (no flaky tests, plan 9.3). Set
// SCHEMA_KIT_SEED to explore other inputs locally.
const seed = Number(process.env["SCHEMA_KIT_SEED"] ?? 20261107);

function caseFor(noise: Noise): fc.Arbitrary<{ node: SchemaNode; inputs: unknown[] }> {
  return schemaNode.chain((node) =>
    fc.record({
      node: fc.constant(node),
      inputs: fc.array(inputFor(buildKit(node), noise), { minLength: 1, maxLength: 8 }),
    }),
  );
}

describe("schema-kit.zod-parity", () => {
  describe("random schemas from every combinator", () => {
    for (const noise of ["high", "low"] as const) {
      it(`gives Zod's pass or fail, paths and value (${noise} noise)`, () => {
        fc.assert(
          fc.property(caseFor(noise), ({ node, inputs }) => {
            const zodSchema = buildZod(node);
            const kitSchema = buildKit(node);
            for (const input of inputs) {
              // Zod throws instead of answering when the two sides of an
              // intersection disagree, even on NaN against NaN. There is no
              // verdict to compare then; our own answer is tested in union.test.ts.
              if (zodThrows(() => zodSchema.safeParse(input))) continue;
              expectSameOutcome(zodSchema, kitSchema as never, input);
            }
          }),
          { seed, numRuns: 600 },
        );
      });
    }
  });
});

function zodThrows(run: () => unknown): boolean {
  try {
    run();
    return false;
  } catch {
    return true;
  }
}
