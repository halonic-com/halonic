import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type FixturePackage, manifestFor, runChecks } from "./fixture-repo.ts";

/** `tooling/paperclip`, using `name` in `field`. */
function tooling(field: "dependencies" | "devDependencies", name: string): FixturePackage {
  return {
    directory: "tooling/paperclip",
    manifest: manifestFor("@halonicjs/tooling-paperclip", "tooling", {
      [field]: { [name]: "workspace:*" },
    }),
    files: { "src/index.ts": "export const x = 1;\n" },
  };
}

const paperclipRuntime: FixturePackage = {
  directory: "packages/targets/paperclip/runtime",
  manifest: manifestFor("@halonicjs/target-paperclip-runtime", "targets"),
  files: { "src/index.ts": "export const x = 1;\n" },
};

const cli: FixturePackage = {
  directory: "apps/cli",
  manifest: manifestFor("halonic", "apps"),
  files: { "src/index.ts": "export const x = 1;\n" },
};

const refused = "A target's runtime package is allowed as a dev dependency only.";

/** The layers check's messages for these packages. */
function layerMessages(packages: FixturePackage[]): string[] {
  return runChecks(packages)
    .filter((problem) => problem.rule === "layers")
    .map((problem) => problem.message);
}

verifies("check.tooling-dev-uses-target-runtimes", () => {
  it("lets a tooling package take a target runtime as a dev dependency", () => {
    const found = layerMessages([
      paperclipRuntime,
      tooling("devDependencies", "@halonicjs/target-paperclip-runtime"),
    ]);
    expect(found).toEqual([]);
  });

  it("refuses a target runtime as a tooling package's runtime dependency", () => {
    const found = layerMessages([
      paperclipRuntime,
      tooling("dependencies", "@halonicjs/target-paperclip-runtime"),
    ]);
    expect(found.some((message) => message.includes(refused))).toBe(true);
  });

  it("refuses an app as a tooling package's dev dependency", () => {
    const found = layerMessages([cli, tooling("devDependencies", "halonic")]);
    expect(found.some((message) => message.includes(refused))).toBe(true);
  });
});
