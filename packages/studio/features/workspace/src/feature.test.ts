import { describe, expect, it } from "vitest";
import { workspaceFeature } from "./feature.ts";

describe("workspaceFeature", () => {
  it("is registered under its folder name", () => {
    expect(workspaceFeature.id).toBe("workspace");
  });
});
