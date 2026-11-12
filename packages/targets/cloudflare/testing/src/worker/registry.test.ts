import { describe, expect, it } from "vitest";
import { TestRegistry } from "./registry.ts";

function idOfOnlyCase(registry: TestRegistry): string {
  const [suite] = registry.tree().children;
  const [testCase] = suite?.kind === "suite" ? suite.children : [];
  if (testCase?.kind !== "case") {
    throw new Error("expected one block with one case");
  }
  return testCase.id;
}

describe("TestRegistry", () => {
  it("lists blocks and cases in order, with the block's meta", () => {
    const registry = new TestRegistry();
    registry.describe("outer", () => {
      registry.it("first", () => {});
      registry.describe("inner", () => registry.it("second", () => {}), {
        meta: { requirement: "acme.thing" },
      });
    });
    expect(registry.tree()).toEqual({
      kind: "suite",
      name: "",
      meta: {},
      children: [
        {
          kind: "suite",
          name: "outer",
          meta: {},
          children: [
            { kind: "case", id: "1", name: "first" },
            {
              kind: "suite",
              name: "inner",
              meta: { requirement: "acme.thing" },
              children: [{ kind: "case", id: "2", name: "second" }],
            },
          ],
        },
      ],
    });
  });

  it("runs beforeEach outer first and afterEach inner first, around the body", async () => {
    const registry = new TestRegistry();
    const calls: string[] = [];
    registry.describe("outer", () => {
      registry.beforeEach(() => calls.push("outer before"));
      registry.afterEach(() => calls.push("outer after"));
      registry.describe("inner", () => {
        registry.beforeEach(() => calls.push("inner before"));
        registry.afterEach(() => calls.push("inner after"));
        registry.it("case", () => calls.push("body"));
      });
    });
    const result = await registry.run("1");
    expect(result.status).toBe("passed");
    expect(calls).toEqual(["outer before", "inner before", "body", "inner after", "outer after"]);
  });

  it("runs afterEach after a failed case and reports the first error", async () => {
    const registry = new TestRegistry();
    let cleanedUp = false;
    registry.describe("block", () => {
      registry.afterEach(() => {
        cleanedUp = true;
        throw new Error("cleanup failed too");
      });
      registry.it("fails", () => {
        throw new TypeError("broken");
      });
    });
    const result = await registry.run(idOfOnlyCase(registry));
    expect(cleanedUp).toBe(true);
    expect(result).toMatchObject({ status: "failed", message: "TypeError: broken" });
    expect(result.stack).toContain("broken");
  });

  it("counts the global and the case's own expect calls, starting at zero for each case", async () => {
    const registry = new TestRegistry();
    registry.describe("block", () => {
      registry.it("checks", ({ expect: own }) => {
        registry.expect(1).toBe(1);
        own(2).toBe(2);
        own(null).toBeNull();
      });
    });
    const id = idOfOnlyCase(registry);
    expect((await registry.run(id)).assertions).toBe(3);
    expect((await registry.run(id)).assertions).toBe(3);
  });

  it("reports a thrown non-Error as a failure", async () => {
    const registry = new TestRegistry();
    registry.describe("block", () =>
      registry.it("throws a string", () => {
        throw "plain text";
      }),
    );
    const result = await registry.run(idOfOnlyCase(registry));
    expect(result).toEqual({
      status: "failed",
      assertions: 0,
      message: "A non-Error was thrown: plain text",
    });
  });

  it("refuses an async describe body and an unknown case ID", async () => {
    const registry = new TestRegistry();
    expect(() => registry.describe("async", async () => {})).toThrow("has an async body");
    await expect(registry.run("99")).rejects.toThrow('no case "99"');
  });
});
