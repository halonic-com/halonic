import { describe, expect, it } from "vitest";
import { AssistantHostService } from "./api.ts";
import { assistantFeature } from "./feature.ts";

describe("assistantFeature", () => {
  it("is registered under its folder name", () => {
    expect(assistantFeature.id).toBe("assistant");
  });

  it("names the app's Assistant host under the feature's id", () => {
    expect(AssistantHostService.name).toBe("assistant.host");
  });
});
