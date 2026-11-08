import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { type AnySchema, type IssueCode, s } from "./index.ts";
import { expectSameOutcome } from "./test/compare.ts";

const seed = Number(process.env["SCHEMA_KIT_SEED"] ?? 20261107);

function codesOf(
  schema: Pick<ReturnType<typeof s.unknown>, "safeParse">,
  input: unknown,
): IssueCode[] {
  const result = schema.safeParse(input);
  return result.ok ? [] : result.error.map((issue) => issue.code);
}

function accepts(
  schema: AnySchema & Pick<ReturnType<typeof s.unknown>, "safeParse">,
  input: unknown,
): boolean {
  return schema.safeParse(input).ok;
}

describe("schema-kit.string", () => {
  it("accepts text and refuses anything else", () => {
    expect(s.string().parse("")).toBe("");
    for (const input of [5, null, undefined, [], {}, true])
      expect(codesOf(s.string(), input)).toEqual(["invalid_type"]);
  });

  it("counts length in code points", () => {
    expect(codesOf(s.string().min(2), "😀")).toEqual(["too_small"]);
    expect(codesOf(s.string().max(1), "😀")).toEqual([]);
    // "e" plus a combining accent: two code points that show as one letter.
    expect(codesOf(s.string().max(1), `e${String.fromCodePoint(0x301)}`)).toEqual(["too_big"]);
  });

  it("reports every failing check", () => {
    const schema = s.string().min(1).regex(/^a/, "start with a");
    const result = schema.safeParse("");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.map((issue) => [issue.code, issue.message])).toEqual([
        ["too_small", "Expected at least 1 character"],
        ["invalid_format", "start with a"],
      ]);
    }
  });

  it("names the pattern when no message is given", () => {
    const result = s.string().regex(/^\d+$/).safeParse("x");
    expect(result.ok ? "" : result.error[0]?.message).toBe("Doesn't match the pattern /^\\d+$/");
  });

  it("resets a global pattern's position between parses", () => {
    const schema = s.string().regex(/a/g);
    expect(schema.safeParse("a").ok).toBe(true);
    expect(schema.safeParse("a").ok).toBe(true);
  });

  it("matches Zod on generated text, including odd Unicode", () => {
    const zodSchema = z
      .string()
      .min(2)
      .max(5)
      .regex(/^[a-z]/);
    const kitSchema = s
      .string()
      .min(2)
      .max(5)
      .regex(/^[a-z]/);
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.string({ unit: "binary" }), fc.string({ unit: "grapheme" })),
        (text) => expectSameOutcome(zodSchema, kitSchema, text),
      ),
      { seed, numRuns: 2000 },
    );
  });
});

describe("schema-kit.string-email", () => {
  it("accepts ordinary addresses", () => {
    for (const address of ["family@example.com", "a.b+c@sub.example.co", "o'neil@example.org"]) {
      expect(accepts(s.string().email(), address), address).toBe(true);
    }
  });

  it("refuses text that isn't an address", () => {
    for (const text of [
      "a@b",
      "a",
      "@example.com",
      "a@-b.com",
      "a@b.c",
      "a b@example.com",
      "a..b@example.com",
    ]) {
      expect(codesOf(s.string().email(), text), text).toEqual(["invalid_format"]);
    }
  });

  it("matches Zod on generated addresses", () => {
    const part = fc.stringMatching(/^[a-zA-Z0-9._'+-]{0,6}$/);
    const address = fc
      .tuple(
        part,
        fc.constantFrom("@", "@@", ""),
        part,
        fc.constantFrom(".com", ".c", "", ".co.uk", "-.de"),
      )
      .map((parts) => parts.join(""));
    fc.assert(
      fc.property(address, (text) =>
        expectSameOutcome(z.string().email(), s.string().email(), text),
      ),
      { seed, numRuns: 2000 },
    );
  });
});

describe("schema-kit.number", () => {
  it("accepts only finite numbers", () => {
    expect(s.number().parse(-0.5)).toBe(-0.5);
    for (const input of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "5",
      null,
      5n,
    ]) {
      expect(codesOf(s.number(), input)).toEqual(["invalid_type"]);
    }
  });

  it("checks min, max and positive", () => {
    expect(codesOf(s.number().min(0).max(2), -1)).toEqual(["too_small"]);
    expect(codesOf(s.number().min(0).max(2), 3)).toEqual(["too_big"]);
    expect(codesOf(s.number().min(0).max(2), 2)).toEqual([]);
    expect(codesOf(s.number().positive(), 0)).toEqual(["too_small"]);
    expect(codesOf(s.number().positive(), 0.1)).toEqual([]);
  });

  it("stops at a fraction where a whole number belongs", () => {
    expect(codesOf(s.number().int().min(1).max(64), 1.5)).toEqual(["not_integer"]);
    expect(codesOf(s.number().min(2).int(), 1.5)).toEqual(["too_small", "not_integer"]);
  });

  it("refuses whole numbers beyond the safe range", () => {
    expect(codesOf(s.number().int(), 2 ** 60)).toEqual(["too_big"]);
    expect(codesOf(s.number().int(), -(2 ** 60))).toEqual(["too_small"]);
    expect(codesOf(s.number().int(), Number.MAX_SAFE_INTEGER)).toEqual([]);
  });

  it("matches Zod on generated numbers", () => {
    const zodSchema = z.number().int().min(-5).max(100).positive();
    const kitSchema = s.number().int().min(-5).max(100).positive();
    fc.assert(
      fc.property(
        fc.oneof(fc.double(), fc.integer(), fc.constantFrom(0, -0, 2 ** 53, 2 ** 60)),
        (value) => expectSameOutcome(zodSchema, kitSchema, value),
      ),
      { seed, numRuns: 2000 },
    );
  });
});

describe("schema-kit.boolean", () => {
  it("accepts true and false only", () => {
    expect(s.boolean().parse(true)).toBe(true);
    expect(s.boolean().parse(false)).toBe(false);
    for (const input of ["true", 1, 0, null])
      expect(codesOf(s.boolean(), input)).toEqual(["invalid_type"]);
  });
});

describe("schema-kit.null", () => {
  it("accepts null only", () => {
    expect(s.null().parse(null)).toBe(null);
    for (const input of [undefined, 0, "", "null"])
      expect(codesOf(s.null(), input)).toEqual(["invalid_type"]);
  });
});

describe("schema-kit.unknown", () => {
  it("accepts any value unchanged", () => {
    const value = { a: 1 };
    expect(s.unknown().parse(value)).toBe(value);
    expect(s.unknown().parse(undefined)).toBe(undefined);
    expect(s.unknown().parse(null)).toBe(null);
  });

  it("still makes an object key required", () => {
    const result = s.object({ payload: s.unknown() }).safeParse({});
    expect(result.ok ? [] : result.error).toEqual([
      { code: "required", path: ["payload"], message: 'Missing required key "payload"' },
    ]);
  });
});

describe("schema-kit.literal", () => {
  it("accepts exactly its value", () => {
    expect(s.literal(1).parse(1)).toBe(1);
    expect(s.literal("text").parse("text")).toBe("text");
    expect(s.literal(true).parse(true)).toBe(true);
    expect(s.literal(null).parse(null)).toBe(null);
  });

  it("refuses any other value", () => {
    expect(codesOf(s.literal(1), "1")).toEqual(["invalid_value"]);
    expect(codesOf(s.literal(true), 1)).toEqual(["invalid_value"]);
    const result = s.literal("text").safeParse("json");
    expect(result.ok ? "" : result.error[0]?.message).toBe('Expected "text"');
  });
});

describe("schema-kit.enum", () => {
  const effort = s.enum(["low", "medium", "high"]);

  it("accepts the listed texts", () => {
    expect(effort.parse("medium")).toBe("medium");
    expect(effort.options).toEqual(["low", "medium", "high"]);
  });

  it("refuses anything else and names the choices", () => {
    const result = effort.safeParse("max");
    expect(result.ok ? [] : result.error).toEqual([
      { code: "invalid_value", path: [], message: "Expected one of: low, medium, high" },
    ]);
    expect(codesOf(effort, 1)).toEqual(["invalid_value"]);
  });
});
