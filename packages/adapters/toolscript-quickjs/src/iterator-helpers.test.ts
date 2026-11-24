import { toolScriptDefaultLimits } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { createQuickJsToolScriptIsolate } from "./index.ts";

// Iterators joined with Iterator.concat and closed early, in every order the
// engine has to get right: before the first value, part way, from inside an
// inner iterator's own `return()`, and again after closing. Memory is
// churned in between, so a value the engine freed too early would be reused.
const closingEarly = `
export function run() {
  const seen = [];
  const counting = (name, count) => ({
    [Symbol.iterator]() {
      let at = 0;
      return {
        next() { at += 1; return { value: name + at, done: at > count }; },
        return() { seen.push("closed " + name); return { done: true }; },
      };
    },
  });
  const churn = () => { let junk = []; for (let index = 0; index < 2000; index++) junk.push({ index }); junk = null; };

  const first = Iterator.concat(counting("a", 3), counting("b", 3));
  first.return();
  seen.push(JSON.stringify(first.next()));

  for (const value of Iterator.concat(counting("c", 3), counting("d", 3))) {
    seen.push(value);
    if (value === "c2") break;
  }
  churn();

  let outer;
  const reentrant = {
    [Symbol.iterator]() {
      return {
        next() { return { value: "e", done: false }; },
        return() { outer.return(); churn(); return { done: true }; },
      };
    },
  };
  outer = Iterator.concat(reentrant, counting("f", 2));
  seen.push(outer.next().value);
  try { outer.return(); } catch (error) { seen.push(String(error)); }
  churn();
  seen.push(JSON.stringify(outer.next()));
  return seen;
}`;

verifies("toolscript-quickjs.engine", () => {
  it("ends iterator helpers that close early with a result or a fixed reason, never a trap", async () => {
    const limits = toolScriptDefaultLimits.user;
    const result = await createQuickJsToolScriptIsolate().run({
      runId: "acme-run",
      code: closingEarly,
      input: null,
      functions: {},
      limits,
    });
    if (result.ok) {
      expect(result.output).toEqual(expect.arrayContaining(["c1", "c2", "closed c"]));
    } else {
      expect(["toolscript.script-error", "limit.memory", "limit.cpu"]).toContain(result.reason);
    }
  });
});
