import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MAX_DEPTH, parse, type Schema, s } from "./index.ts";

type Tree = { child?: Tree | undefined };
const tree: Schema<Tree> = s.lazy(() => s.object({ child: tree.optional() }));

function nested(depth: number): Tree {
  let value: Tree = {};
  for (let level = 0; level < depth; level++) value = { child: value };
  return value;
}

verifies("schema-kit.nesting-limit", () => {
  it("accepts input right at the limit", () => {
    // `depth` wrappers put the innermost map at a path of `depth` keys.
    expect(parse(tree, nested(MAX_DEPTH)).ok).toBe(true);
  });

  it("reports too_deep at the path where the limit is passed", () => {
    const result = parse(tree, nested(MAX_DEPTH + 1));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toHaveLength(1);
    expect(result.error[0]?.code).toBe("too_deep");
    expect(result.error[0]?.path).toEqual(Array(MAX_DEPTH + 1).fill("child"));
    expect(result.error[0]?.message).toBe(`Nested more than ${MAX_DEPTH} levels deep`);
  });

  it("fails 100,000 levels cleanly instead of overflowing the stack", () => {
    const result = parse(tree, nested(100_000));
    expect(result.ok ? [] : result.error.map((issue) => issue.code)).toEqual(["too_deep"]);
  });

  it("stops on a value that contains itself", () => {
    const loop: Tree = {};
    loop.child = loop;
    const result = parse(tree, loop);
    expect(result.ok ? [] : result.error.map((issue) => issue.code)).toEqual(["too_deep"]);
  });

  it("walks sparse lists without throwing", () => {
    // biome-ignore lint/suspicious/noSparseArray: the hole is the point of the test
    expect(parse(s.array(s.unknown()), [[, 1]]).ok).toBe(true);
  });

  it("counts list indexes as levels too", () => {
    let value: unknown = 1;
    for (let level = 0; level <= MAX_DEPTH; level++) value = [value];
    const result = parse(s.unknown(), value);
    expect(result.ok ? [] : result.error[0]?.path).toEqual(Array(MAX_DEPTH + 1).fill(0));
  });
});
