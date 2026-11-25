import { describe, expect, it } from "vitest";
import { quickAskFeature } from "./feature.ts";

describe("quickAskFeature", () => {
  it("is registered under its folder name", () => {
    expect(quickAskFeature.id).toBe("quick-ask");
  });
});
