import { describe, expect, it } from "vitest";
import { placeOf } from "./layout.ts";

describe("placeOf", () => {
  it.each([
    ["packages/core/schema-kit", "core", "@halonicjs/schema-kit"],
    ["packages/adapters/llm-openai", "adapters", "@halonicjs/adapter-llm-openai"],
    ["packages/host", "host", "@halonicjs/host"],
    ["packages/studio/shell", "studio", "@halonicjs/studio-shell"],
    ["packages/studio/features/agents", "studio", "@halonicjs/studio-feature-agents"],
    ["packages/testing/spec", "testing", "@halonicjs/testing-spec"],
    ["apps/cli", "apps", "halonic"],
    ["apps/studio", "apps", "@halonicjs/app-studio"],
    ["tooling/check", "tooling", "@halonicjs/tooling-check"],
  ])("derives layer and name for %s", (directory, layer, expectedName) => {
    expect(placeOf(directory)).toMatchObject({ layer, expectedName });
  });

  it("returns undefined outside the package folders", () => {
    expect(placeOf("docs/guides")).toBeUndefined();
  });
});
