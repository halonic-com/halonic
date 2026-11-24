import { describe, expect, it } from "vitest";
import { held, recorder, script } from "./harness.ts";

describe("fence harness", () => {
  it("wraps a body as a run function in a module", () => {
    expect(script("return 1;")).toBe("export async function run(ctx) {\nreturn 1;\n}\n");
  });

  it("records each call and answers with the given value", async () => {
    const acme = recorder("pong");
    const context = { runId: "acme-run", signal: new AbortController().signal };
    expect(await acme.fn({ n: 1 }, context)).toBe("pong");
    expect(acme.calls).toEqual([{ n: 1 }]);
  });

  it("holds every call until it is released", async () => {
    const slow = held();
    const context = { runId: "acme-run", signal: new AbortController().signal };
    const answers = [slow.fn(null, context), slow.fn(null, context)];
    expect(slow.calls).toBe(2);
    slow.release("done");
    expect(await Promise.all(answers)).toEqual(["done", "done"]);
  });
});
