import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type FixtureOptions,
  type FixturePackage,
  manifestFor,
  runChecks,
} from "./fixture-repo.ts";

/** A core package `std` with these external dev dependencies. */
function coreWith(devDependencies: Record<string, string>): FixturePackage {
  return {
    directory: "packages/core/std",
    manifest: manifestFor("@halonicjs/std", "core", { devDependencies }),
  };
}

function messages(packages: FixturePackage[], options: FixtureOptions = {}): string[] {
  return runChecks(packages, { coreOrder: ["@halonicjs/std"], ...options }).map(
    (problem) => problem.message,
  );
}

/** Changes one entry of the real dependencies.json. */
function withEntry(
  name: string,
  entry: Record<string, unknown>,
): NonNullable<FixtureOptions["editDependencyList"]> {
  return (list) => ({ ...list, dependencies: { ...list.dependencies, [name]: entry } });
}

describe("tooling/check: dependencies.json by name and layer", () => {
  it("allows a dependency only in its listed layers", () => {
    const dependencyList = withEntry("@types/node", {
      category: "dev-tooling",
      allowedIn: ["*"],
      layers: ["tooling"],
      reason: "Node types.",
    });
    expect(
      messages([coreWith({ "@types/node": "catalog:" })], { editDependencyList: dependencyList }),
    ).toContain(
      '"@types/node" is approved only in the tooling layers, not in core. See docs/guides/dependencies.md.',
    );
  });

  it("keeps outside-world code in exactly one adapter", () => {
    const entry = { category: "outside-world", reason: "An API client." };
    const wide = withEntry("vitest", { ...entry, allowedIn: ["*"], layers: ["adapters"] });
    const one = withEntry("vitest", {
      ...entry,
      allowedIn: ["@halonicjs/adapter-llm-x"],
      layers: ["adapters"],
    });
    const isOutsideWorld = (message: string) => message.includes("lives in exactly one adapter");
    expect(messages([], { editDependencyList: wide }).some(isOutsideWorld)).toBe(true);
    expect(messages([], { editDependencyList: one }).some(isOutsideWorld)).toBe(false);
  });

  it("keeps Studio frameworks in the studio and apps layers", () => {
    const dependencyList = withEntry("vitest", {
      category: "studio-framework",
      allowedIn: ["*"],
      layers: ["studio", "core"],
      reason: "UI.",
    });
    expect(
      messages([], { editDependencyList: dependencyList }).some((m) =>
        m.includes("studio and apps"),
      ),
    ).toBe(true);
  });

  it("never matches an inherited object key such as toString", () => {
    expect(messages([coreWith({ toString: "catalog:" })])).toContain(
      "\"toString\" isn't in tooling/check/dependencies.json. Adding a dependency is a decision: add an entry with category, allowedIn and reason, and get Liam's approval in the pull request. See docs/guides/dependencies.md.",
    );
  });
});

describe("tooling/check: catalog and overrides", () => {
  it("requires plain semver ranges in the catalog", () => {
    const workspaceYaml = (yaml: string) =>
      yaml.replace(/^ {2}vitest: .*$/m, "  vitest: npm:other@1");
    const found = messages([], { workspaceYaml });
    expect(found.some((m) => m.startsWith('"vitest: npm:other@1" must be a plain version'))).toBe(
      true,
    );
  });

  it("requires every catalog entry in dependencies.json", () => {
    const workspaceYaml = (yaml: string) =>
      yaml.replace("catalog:\n", "catalog:\n  lodash: ^4.0.0\n");
    expect(messages([], { workspaceYaml })).toContain(
      '"lodash" is in the catalog but not in tooling/check/dependencies.json. See docs/guides/dependencies.md.',
    );
  });

  it("refuses overrides in the workspace file and in package.json", () => {
    const workspaceYaml = (yaml: string) => `${yaml}\noverrides:\n  vitest: npm:other@1\n`;
    const resolutions: FixturePackage = {
      directory: "tooling/x",
      manifest: manifestFor("@halonicjs/tooling-x", "tooling", { resolutions: { a: "1.0.0" } }),
    };
    const found = messages([resolutions], { workspaceYaml });
    expect(found.some((m) => m.startsWith('"overrides" rewrites the dependency tree'))).toBe(true);
    expect(found.some((m) => m.startsWith('"resolutions" rewrites the dependency tree'))).toBe(
      true,
    );
  });

  it("reports a top-level line it can't read, such as a space before the colon", () => {
    const unreadable = (found: string[]) =>
      found.filter((m) => m.startsWith("The check can't read"));
    const overrides = (yaml: string) => `${yaml}\noverrides :\n  vitest: npm:other@1\n`;
    expect(unreadable(messages([], { workspaceYaml: overrides }))).toHaveLength(1);
    const catalog = (yaml: string) => yaml.replace("catalog:\n", "catalog :\n");
    expect(unreadable(messages([], { workspaceYaml: catalog })).length).toBeGreaterThan(0);
  });

  it("refuses named catalogs", () => {
    const found = messages([coreWith({ vitest: "catalog:other" })]);
    expect(found.some((m) => m.includes('"vitest": "catalog:other" must be "catalog:"'))).toBe(
      true,
    );
  });
});

describe("tooling/check: settings files are read strictly", () => {
  it("fails on a typo in policy.json instead of skipping the limit", () => {
    const policy = (real: Record<string, unknown>) => ({
      ...real,
      fileSize: { warnLines: 300, maxLine: 500, warnFunctionLines: 60 },
    });
    expect(() => runChecks([], { policy })).toThrow(
      "tooling/check/policy.json: fileSize.maxLines is missing.",
    );
  });

  it("fails on a wrong type or an unknown setting in policy.json", () => {
    const asText = (real: Record<string, unknown>) => ({ ...real, coreOrder: "std" });
    const extra = (real: Record<string, unknown>) => ({ ...real, published2: [] });
    expect(() => runChecks([], { policy: asText })).toThrow("coreOrder must be a list of strings");
    expect(() => runChecks([], { policy: extra })).toThrow("published2 is not a known setting");
  });

  const malformedExtraExports: [unknown, string][] = [
    [[], "extraExports must be an object"],
    ["./recording", "extraExports must be an object"],
    [null, "extraExports must be an object"],
    [{ "@halonicjs/format": "./recording" }, 'extraExports["@halonicjs/format"] must be a list'],
    [{ "@halonicjs/format": [] }, 'extraExports["@halonicjs/format"] must list at least one'],
    [{ "@halonicjs/format": [1] }, 'extraExports["@halonicjs/format"] must be a list'],
    ...["recording", ".", "./", "./*", "./rec/*", "./a/b", "./Recording", "./api", "./a--b"].map(
      (key): [unknown, string] => [
        { "@halonicjs/format": ["./recording", key] },
        'extraExports["@halonicjs/format"][1] must be "./" and lower-case words',
      ],
    ),
    [
      { "@halonicjs/format": ["./recording", "./recording"] },
      'extraExports["@halonicjs/format"][1] repeats "./recording"',
    ],
  ];
  it.each(malformedExtraExports)(
    "fails on the malformed extraExports %j in policy.json",
    (extraExports, message) => {
      expect(() => runChecks([], { policy: (real) => ({ ...real, extraExports }) })).toThrow(
        `tooling/check/policy.json: ${message}`,
      );
    },
  );

  it("fails on an entry of dependencies.json without layers or with an unknown category", () => {
    const noLayers = withEntry("vitest", {
      category: "dev-tooling",
      allowedIn: ["*"],
      reason: "x",
    });
    const badCategory = withEntry("vitest", {
      category: "tooling",
      allowedIn: ["*"],
      layers: ["tooling"],
      reason: "x",
    });
    expect(() => runChecks([], { editDependencyList: noLayers })).toThrow(
      'dependencies["vitest"].layers is missing',
    );
    expect(() => runChecks([], { editDependencyList: badCategory })).toThrow(
      'dependencies["vitest"].category must be one of',
    );
  });
});

describe("pnpm check", () => {
  it("refuses a rule name that is only an inherited object key", () => {
    const cli = join(import.meta.dirname, "..", "cli", "check.ts");
    const result = spawnSync(process.execPath, [cli, "toString"], { encoding: "utf8" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unknown rule: toString.");
  });
});
