import { describe, expect, it } from "vitest";
import type { Layer } from "../lib/layout.ts";
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

  it("lets only testing packages list dev tooling as a peerDependency", () => {
    const peersOnVitest = (directory: string, name: string, layer: Layer): FixturePackage => ({
      directory,
      manifest: manifestFor(name, layer, {
        devDependencies: { vitest: "catalog:" },
        peerDependencies: { vitest: "catalog:" },
      }),
    });
    const spec = peersOnVitest("packages/testing/spec", "@halonicjs/testing-spec", "testing");
    const adapter = peersOnVitest("packages/adapters/git", "@halonicjs/adapter-git", "adapters");
    expect(runChecks([spec]).map((problem) => problem.message)).toEqual([]);
    const messages = runChecks([adapter]).map((problem) => problem.message);
    expect(messages.some((message) => message.includes("belongs in devDependencies"))).toBe(true);
  });
});
