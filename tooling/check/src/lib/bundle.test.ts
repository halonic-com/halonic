import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type BundleRules, checkCloudBundle, type Metafile, packageOfInput } from "./bundle.ts";
import type { DependencyList, Policy } from "./context.ts";

const checkDir = join(import.meta.dirname, "..", "..");
const policy = JSON.parse(readFileSync(join(checkDir, "policy.json"), "utf8")) as Policy;
const dependencyList = JSON.parse(
  readFileSync(join(checkDir, "dependencies.json"), "utf8"),
) as DependencyList;

const cloudflare: BundleRules = {
  target: "cloudflare",
  runtime: policy.cloudRuntimes["cloudflare"] ?? { providerPackages: [], providerModules: [] },
  dependencyList,
  workspacePackages: new Set(["@halonicjs/format", "@halonicjs/target-cloudflare"]),
};

function metafile(inputs: readonly string[], externals: readonly string[] = []): Metafile {
  return {
    inputs: Object.fromEntries(inputs.map((input) => [input, {}])),
    outputs: {
      "dist/worker.js": {
        imports: externals.map((path) => ({ path, kind: "import-statement", external: true })),
      },
    },
  };
}

function messages(meta: Metafile): string[] {
  return checkCloudBundle(meta, "dist/worker.meta.json", cloudflare).map((p) => p.message);
}

describe("packageOfInput", () => {
  it("finds the package under the last node_modules, scoped or not", () => {
    expect(packageOfInput("node_modules/.pnpm/zod@4.1.12/node_modules/zod/v4/core/core.js")).toBe(
      "zod",
    );
    expect(packageOfInput("node_modules/.pnpm/a@1/node_modules/@scope/b/dist/index.js")).toBe(
      "@scope/b",
    );
    expect(packageOfInput("packages/core/format/src/index.ts")).toBeUndefined();
  });
});

describe("checkCloudBundle", () => {
  it("passes our own code, zod and Cloudflare's own code and modules", () => {
    const meta = metafile(
      [
        "packages/core/format/src/index.ts",
        "node_modules/.pnpm/zod@4.1.12/node_modules/zod/v4/classic/schemas.js",
        "node_modules/@halonicjs/format/src/index.ts",
        "node_modules/wrangler/templates/middleware/common.ts",
        "node_modules/@cloudflare/workers-shared/index.js",
      ],
      ["cloudflare:workers", "node:async_hooks"],
    );
    expect(messages(meta)).toEqual([]);
  });

  it("fails on a library that isn't on the runtime list, once per library", () => {
    const meta = metafile([
      "node_modules/.pnpm/yaml@2.8.1/node_modules/yaml/dist/index.js",
      "node_modules/.pnpm/yaml@2.8.1/node_modules/yaml/dist/parse.js",
    ]);
    expect(messages(meta)).toEqual([
      "The cloudflare runtime bundle contains \"yaml\" (from node_modules/.pnpm/yaml@2.8.1/node_modules/yaml/dist/index.js). A cloud runtime ships only our own code, the provider's own code and the libraries marked cloudRuntime in tooling/check/dependencies.json. Move the code that needs it out of the runtime, or ask for the user's approval. See docs/guides/dependencies.md.",
    ]);
  });

  it("catches what an approved library brings in with it", () => {
    const meta = metafile([
      "node_modules/.pnpm/zod@4.1.12/node_modules/zod/index.js",
      "node_modules/.pnpm/zod@4.1.12/node_modules/tiny-helper/index.js",
    ]);
    expect(messages(meta)).toHaveLength(1);
    expect(messages(meta)[0]).toContain('"tiny-helper"');
  });

  it("fails on an external module the provider doesn't supply", () => {
    expect(messages(metafile([], ["undici"]))).toEqual([
      'The cloudflare runtime bundle leaves "undici" to be loaded at run time, and cloudflare doesn\'t supply it. Only cloudflare:* and node:* may stay external.',
    ]);
  });
});

describe("the cloud runtime list", () => {
  it("holds only zod, the user's one exception", () => {
    const listed = Object.entries(dependencyList.dependencies)
      .filter(([, entry]) => entry.cloudRuntime === true)
      .map(([name]) => name);
    expect(listed).toEqual(["zod"]);
  });
});
