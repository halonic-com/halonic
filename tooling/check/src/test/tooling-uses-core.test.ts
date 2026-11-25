import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { Layer } from "../lib/layout.ts";
import { type FixturePackage, manifestFor, runChecks, std } from "./fixture-repo.ts";

/** A package that depends on and imports each of `uses`, as a runtime or a dev edge. */
function pkg(
  directory: string,
  name: string,
  layer: Layer,
  uses: string[] = [],
  field: "dependencies" | "devDependencies" = "dependencies",
): FixturePackage {
  const file = field === "dependencies" ? "src/index.ts" : "src/index.test.ts";
  const imports = uses.map((used) => `import "${used}";\n`).join("");
  return {
    directory,
    manifest: manifestFor(name, layer, {
      [field]: Object.fromEntries(uses.map((used) => [used, "workspace:*"])),
    }),
    files: { "src/index.ts": "export const x = 1;\n", [file]: `${imports}export const y = 1;\n` },
  };
}

const plugin = (uses: string[], field?: "dependencies" | "devDependencies"): FixturePackage =>
  pkg("tooling/paperclip", "@halonicjs/tooling-paperclip", "tooling", uses, field);
const adapter = pkg("packages/adapters/git", "@halonicjs/adapter-git", "adapters");
const target = pkg("packages/targets/node/runtime", "@halonicjs/target-node-runtime", "targets");

/** Runs every rule with `toolingUsesCore` set to `names`, as [rule, file, message]. */
function check(packages: FixturePackage[], names: string[]): [string, string, string][] {
  return runChecks(packages, {
    coreOrder: ["@halonicjs/std"],
    policy: (policy) => ({ ...policy, toolingUsesCore: names }),
  }).map((problem) => [problem.rule, problem.file, problem.message]);
}

verifies("check.tooling-uses-core", () => {
  const listed = ["@halonicjs/tooling-paperclip"];

  it("passes a listed tooling package depending on and importing a core package", () => {
    expect(check([std, plugin(["@halonicjs/std"])], listed)).toEqual([]);
    expect(check([std, plugin(["@halonicjs/std"], "devDependencies")], listed)).toEqual([]);
  });

  it("fails a listed tooling package using an adapter or a target, on each edge and import", () => {
    const uses = ["@halonicjs/adapter-git", "@halonicjs/target-node-runtime"];
    const found = check([adapter, target, plugin(uses)], listed);
    const layers = found.filter(([rule]) => rule === "layers");
    expect(layers.map(([, file]) => file)).toEqual([
      "tooling/paperclip/package.json",
      "tooling/paperclip/package.json",
      "tooling/paperclip/src/index.ts",
      "tooling/paperclip/src/index.ts",
    ]);
    for (const [, , message] of layers) {
      expect(message).toContain('listed under "toolingUsesCore"');
      expect(message).toContain("may use core and tooling packages only");
    }
  });

  it("fails an unlisted tooling package using a core package, as before", () => {
    const found = check([std, plugin(["@halonicjs/std"])], []);
    expect(found.map(([rule, file]) => [rule, file])).toEqual([
      ["layers", "tooling/paperclip/package.json"],
      ["layers", "tooling/paperclip/src/index.ts"],
    ]);
    for (const [, , message] of found) {
      expect(message).toContain("tooling packages use only other tooling packages.");
    }
  });

  it("fails a toolingUsesCore entry that isn't a tooling package, or isn't in the repo", () => {
    const found = check([std], ["@halonicjs/std", "@halonicjs/tooling-gone"]);
    expect(found).toEqual([
      [
        "packages",
        "tooling/check/policy.json",
        '"toolingUsesCore" lists "@halonicjs/std", a package in core. It is only for tooling packages; remove it.',
      ],
      [
        "packages",
        "tooling/check/policy.json",
        '"toolingUsesCore" lists "@halonicjs/tooling-gone", which is not a package in this repo. Remove it.',
      ],
    ]);
  });

  it("fails a toolingUsesCore that isn't a list of strings", () => {
    expect(() => check([std], "@halonicjs/tooling-paperclip" as unknown as string[])).toThrow(
      "toolingUsesCore must be a list of strings",
    );
  });
});
