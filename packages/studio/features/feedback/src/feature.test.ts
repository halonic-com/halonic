import { describe, expect, it } from "vitest";
import { feedbackFeature } from "./feature.ts";

describe("feedbackFeature", () => {
  it("is registered under its folder name", () => {
    expect(feedbackFeature.id).toBe("feedback");
  });
});
