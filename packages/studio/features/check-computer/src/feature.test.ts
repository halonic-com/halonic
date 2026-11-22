import { describe, expect, it } from "vitest";
import { checkComputerFeature } from "./feature.ts";

describe("checkComputerFeature", () => {
  it("is registered under its folder name", () => {
    expect(checkComputerFeature.id).toBe("check-computer");
  });
});
