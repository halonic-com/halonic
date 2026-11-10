import { describe, expect, it } from "vitest";
import { inboxFeature } from "./feature.ts";

describe("inboxFeature", () => {
  it("is registered under its folder name", () => {
    expect(inboxFeature.id).toBe("inbox");
  });
});
