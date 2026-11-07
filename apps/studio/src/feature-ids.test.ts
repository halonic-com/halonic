import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { featureIds } from "./feature-ids.ts";

const featuresFolder = new URL("../../../packages/studio/features/", import.meta.url);

/** The feature folders; git keeps no empty folders, so a fresh clone may have none. */
function featureFolders(): string[] {
  if (!existsSync(featuresFolder)) {
    return [];
  }
  return readdirSync(featuresFolder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

describe("featureIds", () => {
  it("lists exactly the feature folders", () => {
    expect(featureIds().sort()).toEqual(featureFolders());
  });
});
