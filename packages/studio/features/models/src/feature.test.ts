import { describe, expect, it } from "vitest";
import { ModelsService } from "./api.ts";
import { modelsFeature } from "./feature.ts";

describe("modelsFeature", () => {
  it("is registered under its folder name", () => {
    expect(modelsFeature.id).toBe("models");
  });

  it("names its service for the other features", () => {
    expect(ModelsService.name).toBe("models");
  });

  it("needs the workspace's models file from the app", () => {
    expect(modelsFeature.needs.map((key) => key.name)).toEqual(["models.files"]);
  });
});
