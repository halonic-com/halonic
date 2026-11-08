import { verifies } from "@halonicjs/testing-spec";
// The derived types are checked by the compiler (pnpm typecheck runs this
// file); the `it` blocks also run it, so a type error shows up in both.
import { expect, expectTypeOf, it } from "vitest";
import { type Infer, type InferInput, type Issue, parse, type Schema, s } from "./index.ts";

verifies("schema-kit.derived-types", () => {
  it("makes optional keys optional and keys with defaults optional only in the input", () => {
    const schema = s.object({
      a: s.string(),
      b: s.number().optional(),
      c: s.boolean().default(false),
    });
    expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<{
      a: string;
      b?: number | undefined;
      c: boolean;
    }>();
    expectTypeOf<InferInput<typeof schema>>().toEqualTypeOf<{
      a: string;
      b?: number | undefined;
      c?: boolean | undefined;
    }>();
    expect(parse(schema, { a: "x" })).toEqual({ ok: true, value: { a: "x", c: false } });
  });

  it("types a recursive schema and what parse returns for it", () => {
    type Guard = { all: Guard[] } | { exists: string };
    const guard: Schema<Guard> = s.lazy(() =>
      s.union([
        s.object({ all: s.array(guard) }).strict(),
        s.object({ exists: s.string() }).strict(),
      ]),
    );
    const result = parse(guard, { all: [{ exists: "input.x" }] });
    expectTypeOf(result).toEqualTypeOf<
      { readonly ok: true; readonly value: Guard } | { readonly ok: false; readonly error: Issue[] }
    >();
    expect(result.ok).toBe(true);
  });

  it("gives literal and enum types", () => {
    const effort = s.enum(["low", "medium", "high"]);
    const one = s.literal(1);
    expectTypeOf<Infer<typeof effort>>().toEqualTypeOf<"low" | "medium" | "high">();
    expectTypeOf<Infer<typeof one>>().toEqualTypeOf<1>();
    expect(effort.options).toHaveLength(3);
  });
});
