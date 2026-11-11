import { describe, expect, it } from "vitest";
import { pluginsFeature } from "./feature.ts";

describe("pluginsFeature", () => {
  it("is registered under its folder name", () => {
    expect(pluginsFeature.id).toBe("plugins");
  });
});
