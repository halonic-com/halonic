import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("documents the budget limits as enforced, the way engine.budget-stops promises", () => {
  const source = readFileSync(new URL("./schema.ts", import.meta.url), "utf8");
  expect(source).not.toMatch(/not enforced/i);
  expect(source).toContain("engine.budget-stops");
});
