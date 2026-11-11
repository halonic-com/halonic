import { describe, expect, it } from "vitest";
import { settingsFeature } from "./feature.ts";

describe("settingsFeature", () => {
  it("is registered under its folder name", () => {
    expect(settingsFeature.id).toBe("settings");
  });
});
