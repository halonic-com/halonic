import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toJsonSchema } from "./index.ts";
import { inputFor } from "./test/arbitrary.ts";
import { expectSameOutcome } from "./test/compare.ts";
import * as kit from "./test/old-schemas.kit.ts";
import * as zod from "./test/old-schemas.zod.ts";

const kinds = Object.keys(kit.fileSchemas) as (keyof typeof kit.fileSchemas)[];

// A fixed seed keeps runs repeatable (no flaky tests, plan 9.3). Set
// SCHEMA_KIT_SEED to explore other inputs locally.
const seed = Number(process.env["SCHEMA_KIT_SEED"] ?? 20261107);

describe("schema-kit.zod-parity", () => {
  describe("the old repo's schemas", () => {
    for (const kind of kinds) {
      for (const noise of ["high", "low"] as const) {
        it(`gives Zod's pass or fail, paths and value for ${kind} (${noise} noise)`, () => {
          const kitSchema = kit.fileSchemas[kind];
          const zodSchema = zod.fileSchemas[kind];
          fc.assert(
            fc.property(inputFor(kitSchema, noise), (input) =>
              expectSameOutcome(zodSchema, kitSchema, input),
            ),
            { seed, numRuns: 300 },
          );
        });
      }
    }
  });
});

describe("schema-kit.json-schema-input-mode", () => {
  describe("the old repo's schemas", () => {
    for (const kind of kinds) {
      it(`writes the JSON Schema Zod wrote for ${kind}`, () => {
        const expected = z.toJSONSchema(zod.fileSchemas[kind], {
          io: "input",
          unrepresentable: "any",
        });
        expect(toJsonSchema(kit.fileSchemas[kind])).toEqual(expected);
      });
    }
  });
});
