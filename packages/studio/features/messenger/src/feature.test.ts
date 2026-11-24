import { describe, expect, it } from "vitest";
import { messengerFeature } from "./feature.ts";

describe("messengerFeature", () => {
  it("is registered under its folder name", () => {
    expect(messengerFeature.id).toBe("messenger");
  });
});
