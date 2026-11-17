import { describe, expect, it } from "vitest";
import { routinesFeature } from "./feature.ts";

describe("routinesFeature", () => {
  it("is registered under its folder name", () => {
    expect(routinesFeature.id).toBe("routines");
  });
});
