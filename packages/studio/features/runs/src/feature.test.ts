import { describe, expect, it } from "vitest";
import { runsFeature } from "./feature.ts";

describe("runsFeature", () => {
  it("is registered under its folder name", () => {
    expect(runsFeature.id).toBe("runs");
  });
});
