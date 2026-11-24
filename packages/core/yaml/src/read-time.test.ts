import { unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { Scalar } from "yaml";
import { keepLineComment } from "./edit-text.ts";
import { readYaml } from "./read.ts";

const duplicate = (line: number, col: number) => ({
  ok: false,
  error: { kind: "syntax", message: "Map keys must be unique", line, col },
});

/**
 * Reads `text` and counts how often any parsed value was looked at. Every
 * check that compares keys reads their values: our duplicate check once per
 * key, the yaml library's own check once per earlier key (HAL-16339). So the
 * count grows with the work, not with the runner's speed or load, and the
 * test needs no clock (HAL-17932). The library sets `value` by assignment,
 * so an accessor on the prototype sees every read.
 */
function countValueReads(text: string): { readonly data: unknown; readonly reads: number } {
  const stored = Symbol("value");
  let reads = 0;
  Object.defineProperty(Scalar.prototype, "value", {
    configurable: true,
    get(this: Record<symbol, unknown>) {
      reads++;
      return this[stored];
    },
    set(this: Record<symbol, unknown>, value: unknown) {
      this[stored] = value;
    },
  });
  try {
    return { data: unwrap(readYaml(text)).data, reads };
  } finally {
    Reflect.deleteProperty(Scalar.prototype, "value");
  }
}

verifies("yaml.read-time", () => {
  // Eight times the keys give eight times the reads when reading is linear,
  // and about 64 times when keys are compared pairwise.
  it("reads eight times the keys with well under 16 times the work", () => {
    const readsForMapOf = (count: number) => {
      const text = Array.from({ length: count }, (_, index) => `key${index}: ${index}`).join("\n");
      const { data, reads } = countValueReads(text);
      expect((data as Record<string, number>)[`key${count - 1}`]).toBe(count - 1);
      return reads;
    };
    const small = readsForMapOf(2_000);
    const large = readsForMapOf(16_000);
    // Proves the accessor saw the reads: without them the ratio means nothing.
    expect(small).toBeGreaterThan(2_000);
    expect(large / small).toBeLessThan(16);
  });

  it("finds a key twice in a nested block map and in a flow map, at the second one", () => {
    expect(readYaml("agents:\n  clerk:\n    name: a\n    model: x\n    name: b\n")).toEqual(
      duplicate(5, 5),
    );
    expect(readYaml("a: { b: 1, c: 2, b: 3 }\n")).toEqual(duplicate(1, 18));
    expect(readYaml("list:\n  - a: 1\n  - a: 2\n    a: 3\n")).toEqual(duplicate(4, 5));
  });

  it("compares keys by value, as the yaml library does", () => {
    expect(readYaml("~: 1\nnull: 2\n")).toEqual(duplicate(2, 1));
    // A number and a text are different keys to the library, though not to JavaScript.
    expect(readYaml("1: a\n'1': b\n").ok).toBe(true);
  });

  it("looks for a comment after a long run of blanks at once", () => {
    const text = `${" ".repeat(200_000)}x`;
    expect(keepLineComment(text, 0, 0, "y")).toEqual({ to: 0, rendered: "y" });
    expect(keepLineComment(`:${" ".repeat(200_000)}# keep`, 0, 1, "y")).toEqual({
      to: 200_007,
      rendered: "y # keep",
    });
  });
});
