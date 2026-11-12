import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { defaultCoverageFloors } from "../lib/coverage.ts";
import type { Layer } from "../lib/layout.ts";
import { type FixturePackage, manifestFor, runChecks, std } from "./fixture-repo.ts";

/** A package with one source file and internal dependencies on `uses`. */
function pkg(
  directory: string,
  name: string,
  layer: Layer,
  options: { uses?: string[]; source?: string; halonic?: Record<string, unknown> } = {},
): FixturePackage {
  return {
    directory,
    manifest: manifestFor(name, layer, {
      dependencies: Object.fromEntries((options.uses ?? []).map((used) => [used, "workspace:*"])),
      halonic: { layer, owner: "mateo", coverage: { lines: 80 }, ...options.halonic },
    }),
    files: { "src/index.ts": options.source ?? "export const x = 1;\n" },
  };
}

const server = pkg("packages/host/server", "@halonicjs/host-server", "host");
const fsNode = pkg("packages/adapters/fs-node", "@halonicjs/adapter-fs-node", "adapters", {
  halonic: { runtime: "node" },
});
const nodeRuntime = (options: Parameters<typeof pkg>[3] = {}): FixturePackage =>
  pkg("packages/targets/node/runtime", "@halonicjs/target-node-runtime", "targets", options);
const cloudflareRuntime = (options: Parameters<typeof pkg>[3] = {}): FixturePackage =>
  pkg(
    "packages/targets/cloudflare/runtime",
    "@halonicjs/target-cloudflare-runtime",
    "targets",
    options,
  );
const cloudflareDeploy = (options: Parameters<typeof pkg>[3] = {}): FixturePackage =>
  pkg(
    "packages/targets/cloudflare/deploy",
    "@halonicjs/target-cloudflare-deploy",
    "targets",
    options,
  );

function messages(packages: FixturePackage[]): string[] {
  const coreOrder = packages.includes(std) ? ["@halonicjs/std"] : [];
  return runChecks(packages, { coreOrder }).map((problem) => problem.message);
}

describe("tooling/check: host and targets", () => {
  it("passes a Node runtime wiring core, the host and a Node adapter", () => {
    const runtime = nodeRuntime({
      uses: ["@halonicjs/std", "@halonicjs/host-server", "@halonicjs/adapter-fs-node"],
      source: 'import "node:http";\nimport "@halonicjs/host-server";\nexport const x = 1;\n',
    });
    expect(messages([std, server, fsNode, runtime])).toEqual([]);
  });

  it("passes a deploy package that ships its runtime and uses Node APIs", () => {
    const deploy = cloudflareDeploy({
      uses: ["@halonicjs/target-cloudflare-runtime", "@halonicjs/adapter-fs-node"],
      source: 'import "node:fs";\nexport const x = 1;\n',
    });
    expect(messages([fsNode, cloudflareRuntime(), deploy])).toEqual([]);
  });

  it("keeps the host runtime-neutral: no Node APIs, no adapters", () => {
    const leaky = pkg("packages/host/server", "@halonicjs/host-server", "host", {
      uses: ["@halonicjs/adapter-fs-node"],
      source: 'import "node:fs";\nexport const x = 1;\n',
    });
    const found = messages([fsNode, leaky]);
    expect(found.some((message) => message.includes("may use core packages only"))).toBe(true);
    expect(found.some((message) => message.includes("Web-standard APIs only"))).toBe(true);
  });

  it("stops a runtime from using a deploy package or another target's runtime", () => {
    const found = messages([
      cloudflareRuntime({ uses: ["@halonicjs/target-cloudflare-deploy"] }),
      cloudflareDeploy(),
      nodeRuntime({ uses: ["@halonicjs/target-cloudflare-runtime"] }),
    ]);
    expect(found.filter((message) => message.includes("never uses a deploy package"))).toHaveLength(
      2,
    );
  });

  it("stops a deploy package from using the host or another deploy package", () => {
    const found = messages([server, cloudflareDeploy({ uses: ["@halonicjs/host-server"] })]);
    expect(found.some((message) => message.includes("a deploy package may use"))).toBe(true);
  });

  it("stops a deploy package from shipping another target's runtime", () => {
    const found = messages([
      nodeRuntime(),
      cloudflareDeploy({ uses: ["@halonicjs/target-node-runtime"] }),
    ]);
    expect(found.some((message) => message.includes("a deploy package may use"))).toBe(true);
  });

  it("allows node:* only in the Node runtime and cloudflare:* only on Cloudflare", () => {
    const found = messages([
      nodeRuntime({ source: 'import "cloudflare:workers";\nexport const x = 1;\n' }),
      cloudflareRuntime({
        source: 'import "node:fs";\nimport "cloudflare:workers";\nexport const x = 1;\n',
      }),
    ]);
    expect(found).toHaveLength(2);
    expect(found.some((message) => message.includes("only the Node target's runtime"))).toBe(true);
    expect(found.some((message) => message.includes('"cloudflare:workers" exists only'))).toBe(
      true,
    );
  });

  it("keeps Studio packages out of targets", () => {
    const shell = pkg("packages/studio/shell", "@halonicjs/studio-shell", "studio");
    const found = messages([shell, nodeRuntime({ uses: ["@halonicjs/studio-shell"] })]);
    expect(found.some((message) => message.includes("core, host and adapter packages only"))).toBe(
      true,
    );
  });

  it("refuses unknown target package kinds", () => {
    const odd = pkg("packages/targets/node/server", "@halonicjs/target-node-server", "targets");
    expect(
      messages([odd]).some((message) => message.includes("Packages live only in the folders")),
    ).toBe(true);
  });
});

verifies("check.cli-never-uses-deploy-targets", () => {
  const cli = (uses: string[], source = "export const x = 1;\n"): FixturePackage =>
    pkg("apps/cli", "halonic", "apps", {
      uses,
      source,
      halonic: { coverage: defaultCoverageFloors.apps },
    });
  const shipsOnlyNode = "the halonic CLI ships only the Node runtime";

  it("passes the CLI using the Node runtime behind halonic serve", () => {
    const source = 'import "@halonicjs/target-node-runtime";\nexport const x = 1;\n';
    expect(messages([nodeRuntime(), cli(["@halonicjs/target-node-runtime"], source)])).toEqual([]);
  });

  it("fails the CLI depending on a deploy package or a cloud runtime, naming each", () => {
    const found = messages([
      cloudflareRuntime(),
      cloudflareDeploy(),
      cli(["@halonicjs/target-cloudflare-deploy", "@halonicjs/target-cloudflare-runtime"]),
    ]);
    const refused = found.filter((message) => message.includes(shipsOnlyNode));
    expect(refused).toHaveLength(2);
    expect(refused.some((message) => message.includes("target-cloudflare-deploy"))).toBe(true);
    expect(refused.some((message) => message.includes("target-cloudflare-runtime"))).toBe(true);
  });

  it("fails an import of a deploy package in the CLI's source", () => {
    const source = 'import "@halonicjs/target-cloudflare-deploy";\nexport const x = 1;\n';
    const found = messages([
      cloudflareDeploy(),
      cli(["@halonicjs/target-cloudflare-deploy"], source),
    ]);
    expect(
      found.some((message) => message.startsWith("imports @halonicjs/target-cloudflare-deploy")),
    ).toBe(true);
  });

  it("fails a deploy package in the CLI's devDependencies too", () => {
    const withDev: FixturePackage = {
      ...cli([]),
      manifest: manifestFor("halonic", "apps", {
        devDependencies: { "@halonicjs/target-cloudflare-deploy": "workspace:*" },
        halonic: { layer: "apps", owner: "mateo", coverage: defaultCoverageFloors.apps },
      }),
    };
    const found = messages([cloudflareDeploy(), withDev]);
    expect(found.some((message) => message.includes(shipsOnlyNode))).toBe(true);
  });

  it("leaves other apps free to use a target", () => {
    const studio = pkg("apps/studio", "@halonicjs/app-studio", "apps", {
      uses: ["@halonicjs/target-cloudflare-deploy"],
      halonic: { coverage: defaultCoverageFloors.apps },
    });
    expect(messages([cloudflareDeploy(), studio])).toEqual([]);
  });
});

describe("tooling/check: adapter runtime", () => {
  const adapter = (runtime: unknown, source = "export const x = 1;\n"): FixturePackage =>
    pkg("packages/adapters/mcp", "@halonicjs/adapter-mcp", "adapters", {
      halonic: runtime === undefined ? {} : { runtime },
      source,
    });

  it("requires a known runtime", () => {
    for (const runtime of [undefined, "deno"]) {
      expect(messages([adapter(runtime)]).some((message) => message.includes('"runtime"'))).toBe(
        true,
      );
    }
    for (const runtime of ["node", "web", "workers", "any"]) {
      expect(messages([adapter(runtime)])).toEqual([]);
    }
  });

  it("allows Node APIs only in node adapters", () => {
    const source = 'import "node:fs";\nexport const x = 1;\n';
    expect(messages([adapter("node", source)])).toEqual([]);
    for (const runtime of ["web", "workers", "any"]) {
      expect(
        messages([adapter(runtime, source)]).some((message) => message.includes("Node APIs")),
      ).toBe(true);
    }
  });

  it("allows cloudflare:* only in cloudflare-* adapters", () => {
    const source = 'import "cloudflare:workers";\nexport const x = 1;\n';
    const durable = pkg(
      "packages/adapters/cloudflare-durable",
      "@halonicjs/adapter-cloudflare-durable",
      "adapters",
      { halonic: { runtime: "workers" }, source },
    );
    expect(messages([durable])).toEqual([]);
    expect(messages([adapter("workers", source)])).toHaveLength(1);
  });

  it("refuses a runtime on packages that aren't adapters", () => {
    const withRuntime = pkg("packages/host/server", "@halonicjs/host-server", "host", {
      halonic: { runtime: "node" },
    });
    expect(messages([withRuntime]).some((message) => message.includes("Only adapters"))).toBe(true);
  });
});

describe("tooling/check: reserved core names", () => {
  it.each(["root", "host", "host-x", "target-node"])("refuses packages/core/%s", (folder) => {
    const core = pkg(`packages/core/${folder}`, `@halonicjs/${folder}`, "core");
    const found = runChecks([core], { coreOrder: [`@halonicjs/${folder}`] });
    expect(found.some((problem) => problem.message.includes("belong to other layers"))).toBe(true);
  });
});

describe("tooling/check: contract suite", () => {
  it("keeps node:* out of contract-suite files, except under src/node/", () => {
    const contracts = (files: Record<string, string>): FixturePackage => ({
      ...pkg("packages/testing/contracts", "@halonicjs/testing-contracts", "testing"),
      files: { "src/index.ts": "export const x = 1;\n", ...files },
    });
    const node = 'import "node:fs";\nexport const x = 1;\n';
    const found = messages([
      contracts({
        "src/clock.ts": node,
        "src/node/fs-harness.ts": node,
        "src/clock.test.ts": node,
        "vitest.config.ts": 'import "node:url";\nexport default definePackageTestConfig();\n',
      }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("contract-suite files");
    expect(found[0]).toContain("src/node/");
  });
});
