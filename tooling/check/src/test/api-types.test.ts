import { describe, expect, it } from "vitest";
import { type FixturePackage, manifestFor, runChecks, std } from "./fixture-repo.ts";

/** A core package whose `src/index.ts` is `text`, with `dependencies`. */
function corePackage(
  name: string,
  text: string,
  dependencies: Record<string, string> = {},
): FixturePackage {
  return {
    directory: `packages/core/${name}`,
    manifest: manifestFor(`@halonicjs/${name}`, "core", { dependencies }),
    files: { "src/index.ts": text },
  };
}

const events = corePackage("events", "export type RunEvent = { readonly kind: string };\n");
const ports = corePackage(
  "ports",
  'import type { RunEvent } from "@halonicjs/events";\nexport type Port = { readonly last: RunEvent };\n',
  { "@halonicjs/events": "workspace:*" },
);

/** Runs every rule with `apiTypes` set to `names`. */
function checkWithApiTypes(
  packages: readonly FixturePackage[],
  coreOrder: string[],
  names: string[],
): [string, string, string][] {
  return runChecks(packages, {
    coreOrder,
    policy: (policy) => ({ ...policy, apiTypes: names }),
  }).map((problem) => [problem.rule, problem.file, problem.message]);
}

describe("tooling/check: API types packages", () => {
  it("lets an API types package use another API types package", () => {
    const found = checkWithApiTypes(
      [events, ports],
      ["@halonicjs/events", "@halonicjs/ports"],
      ["@halonicjs/events", "@halonicjs/ports"],
    );
    expect(found).toEqual([]);
  });

  it("stops an API types package using any other core package, whatever the core order says", () => {
    const usesStd = corePackage(
      "events",
      'import { x } from "@halonicjs/std";\nexport const y = x;\n',
      { "@halonicjs/std": "workspace:*" },
    );
    const found = checkWithApiTypes(
      [std, usesStd],
      ["@halonicjs/std", "@halonicjs/events"],
      ["@halonicjs/events"],
    );
    expect(found.map(([rule, file]) => [rule, file])).toEqual([
      ["layers", "packages/core/events/package.json"],
      ["layers", "packages/core/events/src/index.ts"],
    ]);
    for (const [, , message] of found) {
      expect(message).toContain("@halonicjs/events holds API types");
    }
  });

  it("stops an API types package using third-party code, even a core exception", () => {
    const usesZod = corePackage(
      "events",
      'import type { z } from "zod";\nexport type Schema = z.ZodString;\n',
      { zod: "catalog:" },
    );
    const found = checkWithApiTypes([usesZod], ["@halonicjs/events"], ["@halonicjs/events"]);
    const layers = found.filter(([rule]) => rule === "layers");
    expect(layers).toHaveLength(1);
    expect(layers[0]?.[2]).toContain("and no third-party code");
  });

  it("treats a policy without apiTypes as an empty list", () => {
    const found = runChecks([events, ports], {
      coreOrder: ["@halonicjs/events", "@halonicjs/ports"],
      policy: ({ apiTypes: _left, ...policy }) => policy,
    });
    expect(found).toEqual([]);
  });

  it("reports an API types entry that is not a core package", () => {
    const found = checkWithApiTypes([std], ["@halonicjs/std"], ["@halonicjs/client"]);
    expect(found).toEqual([
      [
        "packages",
        "tooling/check/policy.json",
        '"apiTypes" lists "@halonicjs/client", which is not a core package. API types packages are core packages; remove it or move the package into packages/core.',
      ],
    ]);
  });
});
