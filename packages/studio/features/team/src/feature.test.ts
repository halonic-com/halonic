import { describe, expect, it } from "vitest";
import { teamFeature } from "./feature.ts";

describe("teamFeature", () => {
  it("is registered under its folder name", () => {
    expect(teamFeature.id).toBe("team");
  });
});
