import { unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { keepLineComment } from "./edit-text.ts";
import { readYaml } from "./read.ts";

const duplicate = (line: number, col: number) => ({
  ok: false,
  error: { kind: "syntax", message: "Map keys must be unique", line, col },
});

verifies("yaml.read-time", () => {
  // Compares how the time grows instead of a fixed budget, so a slow runner
  // (coverage makes CI 20-40 times slower) cannot fail it. Eight times the keys
  // take about 7 times as long when reading is linear, about 30 times when it
  // is quadratic. On a shared runner one reading can stall (another job, garbage
  // collection), which once gave 23 times (HAL-17682). So both sizes are warmed
  // up, each round reads the large map and the small one back to back so a slow
  // stretch hits both, and the median of the rounds' ratios counts.
  it("reads eight times the keys in well under 16 times the time", { timeout: 120_000 }, () => {
    const mapOf = (count: number) =>
      Array.from({ length: count }, (_, index) => `key${index}: ${index}`).join("\n");
    const small = mapOf(2_000);
    const large = mapOf(16_000);
    const timed = (text: string, lastKey: number) => {
      const start = performance.now();
      const data = unwrap(readYaml(text)).data as Record<string, number>;
      const took = performance.now() - start;
      expect(data[`key${lastKey}`]).toBe(lastKey);
      return took;
    };
    timed(small, 1_999);
    timed(large, 15_999);
    const ratios = Array.from({ length: 7 }, () => timed(large, 15_999) / timed(small, 1_999));
    const median = ratios.sort((left, right) => left - right)[3];
    expect(median).toBeLessThan(16);
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
