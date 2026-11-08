import { describe, expect, it } from "vitest";
import { featureExportName, renderFeaturesFile } from "./features.ts";

describe("featureExportName", () => {
  it("turns a folder name into the feature's export name", () => {
    expect(featureExportName("agents")).toBe("agentsFeature");
    expect(featureExportName("source-control")).toBe("sourceControlFeature");
  });
});

describe("renderFeaturesFile", () => {
  it("imports every feature and lists them in order", () => {
    const text = renderFeaturesFile([
      "@halonicjs/studio-feature-agents",
      "@halonicjs/studio-feature-source-control",
    ]);
    expect(text).toContain('import { agentsFeature } from "@halonicjs/studio-feature-agents";');
    expect(text).toContain("= [agentsFeature, sourceControlFeature];");
  });

  it("produces a typed empty list when there are no features", () => {
    expect(renderFeaturesFile([])).toContain("readonly GeneratedFeature[] = [];");
  });
});
