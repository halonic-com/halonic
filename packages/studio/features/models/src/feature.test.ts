import { createShell } from "@halonicjs/studio-shell";
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

  it("registers in the shell without needing anything from the app", () => {
    expect(() => createShell({ features: [modelsFeature] })).not.toThrow();
  });
});
