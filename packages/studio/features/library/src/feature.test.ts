import { describe, expect, it } from "vitest";
import { libraryFeature } from "./feature.ts";

describe("libraryFeature", () => {
  it("is registered under its folder name", () => {
    expect(libraryFeature.id).toBe("library");
  });
});
