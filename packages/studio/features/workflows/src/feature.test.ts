import { describe, expect, it } from "vitest";
import { workflowsFeature } from "./feature.ts";

describe("workflowsFeature", () => {
  it("is registered under its folder name", () => {
    expect(workflowsFeature.id).toBe("workflows");
  });
});
