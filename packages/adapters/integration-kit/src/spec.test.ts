import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Integration,
  type IntegrationTool,
  integrationVersion,
  type SecretPlacement,
} from "@halonicjs/ports";
import type { Infer } from "@halonicjs/schema-kit";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectSpecFile } from "@halonicjs/testing-spec/node";
import { expect, expectTypeOf, it } from "vitest";
import {
  type integration,
  jsonSchemaOf,
  type SpecName,
  type secretPlacement,
  specId,
  specNames,
  type tool,
} from "./spec.ts";

type Defined<T> = T extends unknown ? { [K in keyof T]-?: Exclude<T[K], undefined> } : never;
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type RequiredKeys<T> = T extends unknown
  ? { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T]
  : never;

/**
 * `true` when the schema's type and the ports type have the same keys, the same value types
 * and the same required keys, and the ports type fits the schema. (The schema's optional keys
 * also accept `undefined`, which JSON can't carry, so the other direction can't be exact.)
 */
type Same<Schema, Port> =
  Mutual<Defined<Schema>, Defined<Port>> extends true
    ? Mutual<RequiredKeys<Schema>, RequiredKeys<Port>> extends true
      ? [Port] extends [Schema]
        ? true
        : false
      : false
    : false;

function specPath(spec: SpecName): string {
  return join(import.meta.dirname, "..", "spec", `${spec}.schema.json`);
}

verifies("integration-kit.spec-files", () => {
  it.each(specNames)("matches the spec file for %s", (spec) => {
    expectSpecFile(specPath(spec), jsonSchemaOf(spec));
  });

  it.each(specNames)("names the interface version in the $id of %s", (spec) => {
    const file = JSON.parse(readFileSync(specPath(spec), "utf8")) as Record<string, unknown>;
    expect(file["$id"]).toBe(specId(spec));
    expect(String(file["$id"])).toMatch(
      new RegExp(`/${spec}/v${integrationVersion}\\.schema\\.json$`),
    );
  });

  it("requires name, version and tools, and a risk on each tool", () => {
    const schema = jsonSchemaOf("integration");
    expect(schema["required"]).toEqual(["name", "version", "tools"]);
    const tools = (schema["properties"] as Record<string, { items: Record<string, unknown> }>)[
      "tools"
    ];
    expect(tools?.items["required"]).toContain("risk");
  });

  it("offers the bearer, header and form placements", () => {
    const placements = jsonSchemaOf("secret-placement")["oneOf"] as {
      properties: { as: { const: SecretPlacement["as"] } };
    }[];
    expect(placements.map((placement) => placement.properties.as.const)).toEqual([
      "bearer",
      "header",
      "form",
    ]);
  });

  typeTest("describes the same data as the types in ports", () => {
    expectTypeOf<Same<Infer<typeof tool>, IntegrationTool>>().toEqualTypeOf<true>();
    expectTypeOf<Same<Infer<typeof secretPlacement>, SecretPlacement>>().toEqualTypeOf<true>();
    type Data = Infer<typeof integration>;
    expectTypeOf<
      Same<Omit<Data, "tools">, Omit<Integration, "connect" | "tools">>
    >().toEqualTypeOf<true>();
    expectTypeOf<Same<Data["tools"][number], Integration["tools"][number]>>().toEqualTypeOf<true>();
    expectTypeOf<keyof Data>().toEqualTypeOf<Exclude<keyof Integration, "connect">>();
  });
});
