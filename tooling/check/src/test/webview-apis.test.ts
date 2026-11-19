import { describe, expect, it } from "vitest";
import { findBuiltInMembers, studioApp } from "../rules/webview-apis.ts";
import { type FixturePackage, manifestFor, runChecks } from "./fixture-repo.ts";

const usesUrlParse = "export const origin = (a: string) => URL.parse(a)?.origin;\n";
const usesNewUrl = "export const origin = (a: string) => new URL(a).origin;\n";

/** A package at `directory` named `name`, with these `dependencies` and files. */
function pkg(
  directory: string,
  name: string,
  dependencies: Record<string, string>,
  files: Record<string, string>,
): FixturePackage {
  const layer = directory.startsWith("apps/") ? "apps" : "adapters";
  return {
    directory,
    manifest: manifestFor(name, layer, { dependencies }),
    files: { "src/index.ts": "export const x = 1;\n", ...files },
  };
}

/** The Studio app, depending on the named workspace packages. */
function studio(uses: string[], files: Record<string, string> = {}): FixturePackage {
  return pkg(
    "apps/studio",
    studioApp,
    Object.fromEntries(uses.map((name) => [name, "workspace:*"])),
    files,
  );
}

/** The webview-apis errors for these packages, as "file:line: message". */
function problems(packages: FixturePackage[]): string[] {
  return runChecks(packages, { rules: ["webview-apis"] }).map(
    (problem) => `${problem.file}:${problem.line}: ${problem.message}`,
  );
}

describe("tooling/check: webview-apis", () => {
  it("flags URL.parse in the Studio app itself, with the line, the versions and the fix", () => {
    const found = problems([studio([], { "src/origin.ts": `\n${usesUrlParse}` })]);

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("apps/studio/src/origin.ts:2: uses URL.parse");
    expect(found[0]).toContain("Safari 18 and Chromium 126");
    expect(found[0]).toContain(`${studioApp} runs in Studio's page`);
    expect(found[0]).toContain("new URL(…) in a try");
  });

  it("flags it in a package Studio depends on through another one", () => {
    const models = pkg(
      "packages/adapters/models",
      "@halonicjs/adapter-models",
      { "@halonicjs/adapter-origins": "workspace:*" },
      {},
    );
    const origins = pkg(
      "packages/adapters/origins",
      "@halonicjs/adapter-origins",
      {},
      {
        "src/origin.ts": usesUrlParse,
      },
    );

    const found = problems([studio(["@halonicjs/adapter-models"]), models, origins]);

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("packages/adapters/origins/src/origin.ts:1:");
  });

  it("leaves packages Studio doesn't load, its tests and its tool config alone", () => {
    const cliOnly = pkg(
      "packages/adapters/bridge",
      "@halonicjs/adapter-bridge",
      {},
      {
        "src/origin.ts": usesUrlParse,
      },
    );
    const app = studio([], {
      "src/origin.test.ts": usesUrlParse,
      "vite.config.ts": usesUrlParse,
      "src/origin.ts": usesNewUrl,
    });

    expect(problems([app, cliOnly])).toEqual([]);
  });

  it("follows peer and optional dependencies, not dev dependencies", () => {
    const dependent = (field: string, name: string): FixturePackage => ({
      directory: `packages/adapters/${name}`,
      manifest: manifestFor(`@halonicjs/adapter-${name}`, "adapters", {
        [field]: { [`@halonicjs/adapter-${name}-used`]: "workspace:*" },
      }),
      files: { "src/index.ts": "export const x = 1;\n" },
    });
    const used = (name: string): FixturePackage =>
      pkg(
        `packages/adapters/${name}-used`,
        `@halonicjs/adapter-${name}-used`,
        {},
        {
          "src/origin.ts": usesUrlParse,
        },
      );
    const names = {
      peer: "peerDependencies",
      optional: "optionalDependencies",
      dev: "devDependencies",
    };

    const found = problems([
      studio(Object.keys(names).map((name) => `@halonicjs/adapter-${name}`)),
      ...Object.entries(names).flatMap(([name, field]) => [dependent(field, name), used(name)]),
    ]);

    expect(found.map((line) => line.split(":")[0])).toEqual([
      "packages/adapters/optional-used/src/origin.ts",
      "packages/adapters/peer-used/src/origin.ts",
    ]);
  });
});

describe("findBuiltInMembers", () => {
  /** The member names found in a TypeScript file. */
  function members(text: string): string[] {
    return findBuiltInMembers("a.ts", text).map((member) => member.name);
  }

  it.each([
    ["a call", "URL.parse(x);"],
    ["a read without a call", "const parse = URL.parse;"],
    ["a quoted name", 'URL["parse"](x);'],
    ["the class on a global object", "globalThis.URL.parse(x);"],
    ["the class in parentheses", "(URL as typeof URL).parse(x);"],
  ])("finds URL.parse in %s", (_name, text) => {
    expect(members(text)).toEqual(["URL.parse"]);
  });

  it("reports the line", () => {
    expect(findBuiltInMembers("a.ts", "const a = 1;\nURL.canParse(a);\n")).toEqual([
      { name: "URL.canParse", line: 2 },
    ]);
  });

  it.each([
    "new URL(x).href;",
    "url.parse(x);",
    "JSON.parse(x);",
    "other.URL.parse(x);",
    "const o = { URL: 1 }; o.URL;",
  ])("leaves %s alone", (text) => {
    expect(members(text)).toEqual([]);
  });
});
