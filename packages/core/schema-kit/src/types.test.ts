// The derived types are checked by the compiler (pnpm typecheck runs this
// file); the `it` blocks also run it, so a type error shows up in both.
import { describe, expect, expectTypeOf, it } from "vitest";
import { type Infer, type InferInput, type Schema, s } from "./index.ts";
import type * as old from "./test/old-schemas.kit.ts";

describe("schema-kit.derived-types", () => {
  it("gives the primitive types", () => {
    expectTypeOf<Infer<ReturnType<typeof s.string>>>().toEqualTypeOf<string>();
    expectTypeOf<Infer<ReturnType<typeof s.number>>>().toEqualTypeOf<number>();
    expectTypeOf<Infer<ReturnType<typeof s.boolean>>>().toEqualTypeOf<boolean>();
    expectTypeOf<Infer<ReturnType<typeof s.null>>>().toEqualTypeOf<null>();
    expectTypeOf<Infer<ReturnType<typeof s.unknown>>>().toEqualTypeOf<unknown>();
    expect(true).toBe(true);
  });

  it("gives literal and enum types", () => {
    const one = s.literal(1);
    const effort = s.enum(["low", "medium", "high"]);
    expectTypeOf<Infer<typeof one>>().toEqualTypeOf<1>();
    expectTypeOf<Infer<typeof effort>>().toEqualTypeOf<"low" | "medium" | "high">();
    expect(effort.options).toHaveLength(3);
  });

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
    expect(schema.parse({ a: "x" })).toEqual({ a: "x", c: false });
  });

  it("keeps unknown keys in the type of passthrough objects", () => {
    const schema = s.object({ name: s.string() }).passthrough();
    expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<
      { name: string } & { [key: string]: unknown }
    >();
    expect(schema.parse({ name: "a", x: 1 })).toEqual({ name: "a", x: 1 });
  });

  it("follows extend and partial", () => {
    const base = s.object({ a: s.string(), b: s.number() }).strict();
    const extended = base.extend({ b: s.string(), c: s.boolean().optional() });
    expectTypeOf<Infer<typeof extended>>().toEqualTypeOf<{
      a: string;
      b: string;
      c?: boolean | undefined;
    }>();
    const partial = base.partial();
    expectTypeOf<Infer<typeof partial>>().toEqualTypeOf<{
      a?: string | undefined;
      b?: number | undefined;
    }>();
    expect(partial.parse({})).toEqual({});
  });

  it("gives list, tuple and record types", () => {
    const list = s.array(s.string()).min(1);
    const pair = s.tuple([s.string(), s.number()]);
    const map = s.record(s.string(), s.array(s.number()));
    expectTypeOf<Infer<typeof list>>().toEqualTypeOf<string[]>();
    expectTypeOf<Infer<typeof pair>>().toEqualTypeOf<[string, number]>();
    expectTypeOf<Infer<typeof map>>().toEqualTypeOf<Record<string, number[]>>();
    expect(pair.parse(["a", 1])).toEqual(["a", 1]);
  });

  it("gives union, discriminated union and intersection types", () => {
    const either = s.union([s.literal("text"), s.record(s.string(), s.enum(["string", "number"]))]);
    expectTypeOf<Infer<typeof either>>().toEqualTypeOf<
      "text" | Record<string, "string" | "number">
    >();
    const output = s.discriminatedUnion("type", [
      s.object({ type: s.literal("text") }),
      s.object({ type: s.literal("choice"), options: s.array(s.string()) }),
    ]);
    expectTypeOf<Infer<typeof output>>().toEqualTypeOf<
      { type: "text" } | { type: "choice"; options: string[] }
    >();
    const seed = s.intersection(s.record(s.string(), s.unknown()), s.object({ id: s.string() }));
    expectTypeOf<Infer<typeof seed>>().toEqualTypeOf<Record<string, unknown> & { id: string }>();
    expect(output.parse({ type: "text" })).toEqual({ type: "text" });
  });

  it("gives refined and defaulted schemas the inner type", () => {
    const refined = s
      .string()
      .optional()
      .refine((value) => value !== "", "empty");
    expectTypeOf<Infer<typeof refined>>().toEqualTypeOf<string | undefined>();
    const defaulted = s.array(s.string()).default([]);
    expectTypeOf<Infer<typeof defaulted>>().toEqualTypeOf<string[]>();
    expectTypeOf<InferInput<typeof defaulted>>().toEqualTypeOf<string[] | undefined>();
    const inObject = s.object({ maybe: refined });
    expectTypeOf<Infer<typeof inObject>>().toEqualTypeOf<{ maybe?: string | undefined }>();
    expect(inObject.parse({})).toEqual({});
  });

  it("types a recursive schema through an annotation", () => {
    type Tree = { name: string; children: Tree[] };
    const tree: Schema<Tree> = s.lazy(() =>
      s.object({ name: s.string(), children: s.array(tree) }),
    );
    expectTypeOf<Infer<typeof tree>>().toEqualTypeOf<Tree>();
    expectTypeOf<Infer<typeof old.Guard>>().toEqualTypeOf<old.Guard>();
    expect(tree.parse({ name: "root", children: [] })).toEqual({ name: "root", children: [] });
  });

  it("types the old file schemas like z.infer did", () => {
    expectTypeOf<Infer<typeof old.Deployment>>().toEqualTypeOf<{
      name: string;
      description?: string | undefined;
      host: "local" | "cloudflare";
      stage: "development" | "production";
      shadow: boolean;
    }>();
    expectTypeOf<Infer<typeof old.AgentOutput>>().toEqualTypeOf<
      | { type: "text" }
      | { type: "choice"; options: string[] }
      | { type: "json"; schema?: Record<string, unknown> | undefined }
    >();
    expectTypeOf<Infer<typeof old.Transition>["after"]>().toEqualTypeOf<string | undefined>();
    expect(true).toBe(true);
  });
});
