import { describe, expect, it } from "vitest";
import { toolScriptHostRules } from "./rules.ts";

describe("toolScriptHostRules", () => {
  it("lists each rule once, frozen", () => {
    expect(new Set(toolScriptHostRules).size).toBe(toolScriptHostRules.length);
    expect(Object.isFrozen(toolScriptHostRules)).toBe(true);
  });
});
