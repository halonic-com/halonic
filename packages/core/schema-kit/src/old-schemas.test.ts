import { verifies } from "@halonicjs/testing-spec";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toJsonSchema } from "./index.ts";
import { inputFor } from "./test/arbitrary.spec.ts";
import { expectSameOutcome } from "./test/compare.spec.ts";
import * as kit from "./test/old-schemas.kit.ts";
import * as zod from "./test/old-schemas.zod.ts";

const kinds = Object.keys(kit.fileSchemas) as (keyof typeof kit.fileSchemas)[];

// A fixed seed keeps runs repeatable (no flaky tests). Set
// SCHEMA_KIT_SEED to explore other inputs locally.
const seed = Number(process.env["SCHEMA_KIT_SEED"] ?? 20261107);

// Each property parses 300 generated files with both Zod and schema-kit. For
// workflow, the largest kind, that took 2.0 s median and 3.5 s at worst in
// CI, against Vitest's 5 s default (HAL-5473). Fewer runs would check less,
// and the time is the parsing itself, so the property gets room instead. A
// real hang still fails at 20 s.
const propertyTimeout = 20_000;

verifies("schema-kit.old-schema-parity", () => {
  for (const kind of kinds) {
    for (const noise of ["high", "low"] as const) {
      it(`gives plain Zod's pass or fail, paths and value for ${kind} (${noise} noise)`, {
        timeout: propertyTimeout,
      }, () => {
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

  // Low noise is there so parsed values get compared, which needs valid inputs.
  it("gives mostly valid workflows at low noise", () => {
    const inputs = fc.sample(inputFor(zod.fileSchemas.workflow, "low"), { seed, numRuns: 300 });
    const valid = inputs.filter((input) => zod.fileSchemas.workflow.safeParse(input).success);
    expect(valid.length).toBeGreaterThan(200);
  });
});

verifies("schema-kit.json-schema-input-mode", () => {
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
