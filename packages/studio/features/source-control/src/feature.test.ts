import { describe, expect, it } from "vitest";
import { ChangesSourceService } from "./api.ts";
import { sourceControlFeature } from "./feature.ts";

describe("sourceControlFeature", () => {
  it("is registered under its folder name and reads the app's history", () => {
    expect(sourceControlFeature.id).toBe("source-control");
    expect(sourceControlFeature.needs).toEqual([ChangesSourceService]);
  });
});
