import { describe, expect, it } from "vitest";
import { type FixturePackage, manifestFor, rulesHit, runChecks } from "./fixture-repo.ts";

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

  it("fails on a forbidden scope in a file path", () => {
    const path = `docs/${"@halonic"}/notes.md`;
    const found = runChecks([], { extraFiles: { [path]: "Nothing to see.\n" } });
    expect(found.map((problem) => [problem.rule, problem.file])).toEqual([["names", path]]);
    expect(found[0]?.message).toContain("The path contains");
  });

  it("allows the @halonicjs scope", () => {
    expect(rulesHit([], { extraFiles: { "docs/notes.md": 'import "@halonicjs/std";\n' } })).toEqual(
      [],
    );
  });
});

/** A tooling package with these devDependencies. */
function toolWith(devDependencies: Record<string, string>, name = "x"): FixturePackage {
  return {
    directory: `tooling/${name}`,
    manifest: manifestFor(`@halonicjs/tooling-${name}`, "tooling", { devDependencies }),
  };
}

/** One entry of `dependencies.json`. */
function entry(allowedIn: string[], category = "dev-tooling", reason = "Because.") {
  return { category, allowedIn, reason };
}

describe("tooling/check: dependencies.json", () => {
  it("uses a dependency only in the packages its allowedIn names", () => {
    const list = { vitest: entry(["@halonicjs/tooling-check"]) };
    expect(runChecks([toolWith({ vitest: "catalog:" })], { dependencyList: list })).toEqual([
      expect.objectContaining({
        rule: "dependencies",
        message:
          '"vitest" is approved only for @halonicjs/tooling-check, not @halonicjs/tooling-x. See docs/guides/dependencies.md.',
      }),
    ]);
  });

  it("matches * in allowedIn against any text", () => {
    const list = { vitest: entry(["@halonicjs/tooling-*"]) };
    expect(runChecks([toolWith({ vitest: "catalog:" })], { dependencyList: list })).toEqual([]);
    const narrow = { vitest: entry(["@halonicjs/app-*"]) };
    expect(rulesHit([toolWith({ vitest: "catalog:" })], { dependencyList: narrow })).toEqual([
      "dependencies",
    ]);
  });

  it("keeps dev tooling in devDependencies", () => {
    const tool: FixturePackage = {
      directory: "tooling/x",
      manifest: manifestFor("@halonicjs/tooling-x", "tooling", {
        dependencies: { vitest: "catalog:" },
      }),
    };
    const found = runChecks([tool], { dependencyList: { vitest: entry(["*"]) } });
    expect(found.map((problem) => problem.message)).toEqual([
      '"vitest" is dev tooling and belongs in devDependencies; it must never ship (plan 7.1).',
    ]);
  });

  it("lets other categories ship in dependencies", () => {
    const tool: FixturePackage = {
      directory: "tooling/x",
      manifest: manifestFor("@halonicjs/tooling-x", "tooling", {
        dependencies: { zod: "catalog:" },
      }),
    };
    const list = { zod: entry(["*"], "outside-world") };
    expect(runChecks([tool], { dependencyList: list })).toEqual([]);
  });

  it("refuses an unknown category", () => {
    const list = { vitest: entry(["*"], "nice-to-have") };
    const found = runChecks([toolWith({ vitest: "catalog:" })], { dependencyList: list });
    expect(found.map((problem) => [problem.file, problem.message])).toEqual([
      [
        "tooling/check/dependencies.json",
        '"vitest" has an unknown category "nice-to-have". Use one of: outside-world, studio-framework, dev-tooling.',
      ],
    ]);
  });

  it("requires a reason", () => {
    const list = { vitest: entry(["*"], "dev-tooling", "  ") };
    const found = runChecks([toolWith({ vitest: "catalog:" })], { dependencyList: list });
    expect(found.map((problem) => problem.message)).toEqual(['"vitest" needs a reason.']);
  });

  it("only warns about an entry no package uses", () => {
    expect(runChecks([], { dependencyList: { vitest: entry(["*"]) } })).toEqual([]);
  });

  it("doesn't check internal dependencies against the list", () => {
    const tool = toolWith({ "@halonicjs/tooling-y": "workspace:*" });
    expect(runChecks([tool, toolWith({}, "y")], { dependencyList: {} })).toEqual([]);
  });
});
