import { describe, expect, it } from "vitest";
import { RunsSourceService } from "./api.ts";
import { runsFeature } from "./feature.ts";

describe("runsFeature", () => {
  it("is registered under its folder name and reads the app's runs", () => {
    expect(runsFeature.id).toBe("runs");
    expect(runsFeature.needs).toEqual([RunsSourceService]);
  });
});
