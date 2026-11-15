import { describe, expect, it } from "vitest";
import { filesFeature } from "./feature.ts";

describe("filesFeature", () => {
  it("is registered under its folder name", () => {
    expect(filesFeature.id).toBe("files");
  });
});
