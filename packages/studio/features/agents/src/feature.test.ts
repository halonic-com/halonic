import { describe, expect, it } from "vitest";
import { agentsFeature } from "./feature.ts";

describe("agentsFeature", () => {
  it("is registered under its folder name", () => {
    expect(agentsFeature.id).toBe("agents");
  });
});
