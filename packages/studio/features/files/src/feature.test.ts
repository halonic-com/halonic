import { describe, expect, it } from "vitest";
import { filesFeature } from "./feature.ts";

describe("filesFeature", () => {
  it("is registered under its folder name and needs the files host", () => {
    expect(filesFeature.id).toBe("files");
    expect(filesFeature.needs).toHaveLength(1);
  });
});
