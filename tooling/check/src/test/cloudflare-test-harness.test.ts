import { describe, expect, it } from "vitest";
import { type FixturePackage, manifestFor, runChecks } from "./fixture-repo.ts";

// The workerd test harness (HAL-197 part 1) brings miniflare and esbuild,
// and its own vitest shim. Liam's condition on HAL-6789: the checks, not an
// agreement, keep all three out of the Cloudflare runtime. The bundle check's
// side is in src/lib/bundle.test.ts.

const harness: FixturePackage = {
  directory: "packages/targets/cloudflare/testing",
  manifest: manifestFor("@halonicjs/target-cloudflare-testing", "testing", {
    devDependencies: { esbuild: "catalog:", miniflare: "catalog:" },
  }),
  files: {
    "src/index.ts":
      'import { build } from "esbuild";\nimport { Miniflare } from "miniflare";\nexport const parts = [build, Miniflare];\n',
  },
};

function runtimeWith(extra: Record<string, unknown>, source: string): FixturePackage {
  return {
    directory: "packages/targets/cloudflare/runtime",
    manifest: manifestFor("@halonicjs/target-cloudflare-runtime", "targets", extra),
    files: { "src/index.ts": source },
  };
}

function messagesFor(packages: readonly FixturePackage[]): string[] {
  return runChecks(packages).map((problem) => problem.message);
}

describe("tooling/check: the Cloudflare test harness stays out of the runtime", () => {
  it("lets the harness package use miniflare and esbuild", () => {
    expect(messagesFor([harness])).toEqual([]);
  });

  it("stops the runtime from depending on the harness or importing it outside tests", () => {
    const importsHarness =
      'import { parts } from "@halonicjs/target-cloudflare-testing";\nexport const p = parts;\n';
    const asDependency = runtimeWith(
      { dependencies: { "@halonicjs/target-cloudflare-testing": "workspace:*" } },
      importsHarness,
    );
    const asDependencyMessages = messagesFor([harness, asDependency]);
    expect(
      asDependencyMessages.some((message) => message.includes("never a runtime dependency")),
    ).toBe(true);
    const devOnly = { "@halonicjs/target-cloudflare-testing": "workspace:*" };
    const importedFromSource = runtimeWith({ devDependencies: devOnly }, importsHarness);
    const sourceMessages = messagesFor([harness, importedFromSource]);
    expect(sourceMessages.some((message) => message.includes("never a runtime dependency"))).toBe(
      true,
    );
  });

  it("lets the runtime's own tests use the harness", () => {
    const runtime: FixturePackage = {
      ...runtimeWith(
        { devDependencies: { "@halonicjs/target-cloudflare-testing": "workspace:*" } },
        "export const p = 1;\n",
      ),
      files: {
        "src/index.ts": "export const p = 1;\n",
        "src/index.test.ts":
          'import { parts } from "@halonicjs/target-cloudflare-testing";\nexport const used = parts;\n',
      },
    };
    expect(messagesFor([harness, runtime])).toEqual([]);
  });

  it("stops the runtime from using miniflare or esbuild", () => {
    const runtime = runtimeWith(
      { devDependencies: { esbuild: "catalog:", miniflare: "catalog:" } },
      'import { build } from "esbuild";\nimport { Miniflare } from "miniflare";\nexport const p = [build, Miniflare];\n',
    );
    const messages = messagesFor([runtime]);
    expect(messages).toContain(
      '@halonicjs/target-cloudflare-runtime uses "miniflare". "miniflare" is allowed only in @halonicjs/target-cloudflare-testing. See docs/guides/dependencies.md.',
    );
    expect(messages.some((message) => message.includes('uses "esbuild"'))).toBe(true);
  });

  it("lets the runtime use the Workers types as a dev dependency", () => {
    const runtime = runtimeWith(
      { devDependencies: { "@cloudflare/workers-types": "catalog:" } },
      "export const p = 1;\n",
    );
    expect(messagesFor([runtime])).toEqual([]);
  });
});
