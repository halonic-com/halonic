import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toJsonSchema } from "./index.ts";
import { inputFor } from "./test/arbitrary.ts";
import { expectSameOutcome } from "./test/compare.ts";
import * as kit from "./test/old-schemas.kit.ts";
import * as zod from "./test/old-schemas.zod.ts";

const kinds = Object.keys(kit.fileSchemas) as (keyof typeof kit.fileSchemas)[];

// A fixed seed keeps runs repeatable (no flaky tests). Set
// SCHEMA_KIT_SEED to explore other inputs locally.
const seed = Number(process.env["SCHEMA_KIT_SEED"] ?? 20261107);

describe("schema-kit.old-schema-parity", () => {
  for (const kind of kinds) {
    for (const noise of ["high", "low"] as const) {
      it(`gives plain Zod's pass or fail, paths and value for ${kind} (${noise} noise)`, () => {
        const kitSchema = kit.fileSchemas[kind];
        const zodSchema = zod.fileSchemas[kind];
        fc.assert(
          fc.property(inputFor(zodSchema, noise), (input) =>
            expectSameOutcome(zodSchema, kitSchema, input),
          ),
          { seed, numRuns: 300 },
        );
      });
    }
  }
});

describe("schema-kit.json-schema-input-mode", () => {
  describe("the old repo's schemas", () => {
    for (const kind of kinds) {
      it(`writes the JSON Schema plain Zod writes for ${kind}`, () => {
        const expected = z.toJSONSchema(zod.fileSchemas[kind], {
          io: "input",
          unrepresentable: "any",
        });
        expect(toJsonSchema(kit.fileSchemas[kind])).toEqual(expected);
      });
    }

    it("writes Collection and Deployments, which the old export left out", () => {
      const collection = toJsonSchema(kit.fileSchemas.collection);
      expect(collection["required"]).toEqual(["id", "name", "fields"]);
      expect(collection["additionalProperties"]).toBe(false);
      const deployments = toJsonSchema(kit.fileSchemas.deployments);
      // `version` has a default, so a file may leave it out.
      expect(deployments["required"]).toEqual(["deployments"]);
      expect(deployments["additionalProperties"]).toBe(false);
    });
  });
});
