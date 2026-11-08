import { describe, expect, it } from "vitest";
import { isReservedCoreName, placeOf } from "./layout.ts";

describe("placeOf", () => {
  it.each([
    ["packages/core/schema-kit", "core", "@halonicjs/schema-kit"],
    ["packages/adapters/llm-openai", "adapters", "@halonicjs/adapter-llm-openai"],
    ["packages/host/server", "host", "@halonicjs/host-server"],
    ["packages/targets/node/runtime", "targets", "@halonicjs/target-node-runtime"],
    ["packages/targets/cloudflare/deploy", "targets", "@halonicjs/target-cloudflare-deploy"],
    ["packages/targets/cloudflare/testing", "testing", "@halonicjs/target-cloudflare-testing"],
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
    expect(placeOf("packages/host")).toBeUndefined();
    expect(placeOf("packages/targets/node")).toBeUndefined();
    expect(placeOf("packages/targets/node/server")).toBeUndefined();
  });

  it("names the target and the kind of a target package", () => {
    expect(placeOf("packages/targets/cloudflare/runtime")?.target).toEqual({
      name: "cloudflare",
      kind: "runtime",
    });
  });
});

describe("isReservedCoreName", () => {
  it.each([
    ["root", true],
    ["host", true],
    ["host-server", true],
    ["target-node", true],
    ["studio-x", true],
    ["app", false],
    ["hosting", false],
    ["std", false],
  ])("%s is reserved: %s", (folder, reserved) => {
    expect(isReservedCoreName(folder)).toBe(reserved);
  });
});
