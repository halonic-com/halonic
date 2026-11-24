import { describe, expect, it } from "vitest";
import { actionSteppersFeature } from "./feature.ts";

describe("actionSteppersFeature", () => {
  it("is registered under its folder name", () => {
    expect(actionSteppersFeature.id).toBe("action-steppers");
  });
});
