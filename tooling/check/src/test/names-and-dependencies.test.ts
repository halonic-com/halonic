import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type FixturePackage,
  manifestFor,
  realDependencyListPath,
  rulesHit,
  runChecks,
} from "./fixture-repo.ts";

describe("tooling/check: names and dependencies", () => {
  it("fails on the forbidden scopes anywhere", () => {
    const scoped = `import "@${"studio"}/core";\n`;
    expect(rulesHit([], { extraFiles: { "docs/notes.md": scoped } })).toEqual(["names"]);
  });

  it("requires catalog versions and approved dependencies", () => {
    const tool: FixturePackage = {
      directory: "tooling/x",
      manifest: manifestFor("@halonicjs/tooling-x", "tooling", {
        devDependencies: { vitest: "^5.0.0", lodash: "catalog:" },
      }),
    };
    const messages = runChecks([tool]).map((problem) => problem.message);
    expect(messages.some((message) => message.includes('must be "catalog:"'))).toBe(true);
    expect(
      messages.some((message) => message.includes("isn't in tooling/check/dependencies.json")),
    ).toBe(true);
  });

  it("keeps the approved UI libraries inside studio/kit", () => {
    const shell: FixturePackage = {
      directory: "packages/studio/shell",
      manifest: manifestFor("@halonicjs/studio-shell", "studio", {
        dependencies: { "react-data-grid": "catalog:" },
      }),
    };
    const kit: FixturePackage = {
      directory: "packages/studio/kit",
      manifest: manifestFor("@halonicjs/studio-kit", "studio", {
        dependencies: {
          "react-data-grid": "catalog:",
          remark: "catalog:",
          "remark-gfm": "catalog:",
        },
      }),
    };
    expect(runChecks([kit])).toEqual([]);
    expect(runChecks([kit, shell]).map((problem) => problem.message)).toEqual([
      '@halonicjs/studio-shell uses "react-data-grid". "react-data-grid" is allowed only in @halonicjs/studio-kit. Use the data grid from @halonicjs/studio-kit. See docs/guides/dependencies.md.',
    ]);
  });

  it("names every core exception's packages exactly", () => {
    const list = JSON.parse(readFileSync(realDependencyListPath, "utf8")) as {
      dependencies: Record<string, { category: string; allowedIn: string[] }>;
    };
    const exceptions = Object.entries(list.dependencies)
      .filter(([, entry]) => entry.category === "core-exception")
      .map(([name, entry]) => [name, entry.allowedIn]);
    expect(exceptions).toEqual([
      ["yaml", ["@halonicjs/yaml"]],
      ["zod", ["@halonicjs/schema-kit", "@halonicjs/format"]],
    ]);
  });

  it("rejects a wildcard in a core exception", () => {
    const wide = {
      "left-pad": {
        category: "core-exception",
        allowedIn: ["@halonicjs/*"],
        reason: "A test entry.",
      },
    };
    const messages = runChecks([], { extraDependencies: wide }).map((problem) => problem.message);
    expect(messages).toEqual([
      '"left-pad" is a core exception, so it names each core package exactly; "*" isn\'t allowed. Each one needs the user\'s approval.',
    ]);
  });
});
