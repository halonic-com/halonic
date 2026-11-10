import type {
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
  ConnectorPin,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { contractGrant, contractServerTools } from "./connector-client.ts";
import {
  bypassingCommands,
  bypassingEnv,
  packageOptionCommands,
} from "./connector-pin-bypasses.ts";
import {
  type ConnectorLaunch,
  contractInheritedEnv,
  expectOutside,
  expectSpawnedPinned,
} from "./connector-pin-launch.ts";
import { overridingCommands, overridingEnv } from "./connector-pin-overrides.ts";
import {
  npmMirrorUrl,
  npmPackage,
  npmRegistryUrl,
  npmTamperedUrl,
  pypiPackage,
  pypiRegistryUrl,
  pypiTamperedUrl,
  RecordedRegistryClient,
} from "./recorded-registry.ts";

/** One `stdio` connector factory under test, before the suite creates a client. */
export interface PinnedConnectorHarness {
  /**
   * A `stdio` factory whose programs, once started, offer
   * {@link contractServerTools}, whatever their command.
   */
  factory: ConnectorFactory;
  /** What the factory is given, except `trust` and `http`, which the suite sets. */
  context: Omit<ConnectorFactoryContext, "trust" | "http"> & { workspaceRoot: string };
  /** Every program started so far, in order, as it was spawned. */
  launches(): readonly ConnectorLaunch[];
}

/**
 * Creates a fresh `stdio` factory under test, with nothing started. The
 * factory takes `inheritedEnv` as its own process's environment, the one a
 * program inherits.
 */
export type MakePinnedConnector = (options: {
  inheritedEnv: Readonly<Record<string, string>>;
}) => Promise<PinnedConnectorHarness>;

const npmPin: ConnectorPin = {
  registry: "npm",
  registryUrl: npmRegistryUrl,
  package: npmPackage.name,
  version: "2.3.1",
};

const pypiPin: ConnectorPin = {
  registry: "pypi",
  registryUrl: pypiRegistryUrl,
  package: pypiPackage.name,
  version: "2.3.1",
};

function stdio(
  command: string,
  args: string[],
  pin?: ConnectorPin,
  env: Record<string, string> = {},
  cwd?: string,
): ConnectorConfig {
  return {
    id: "mail",
    transport: {
      kind: "stdio",
      command,
      args,
      env,
      ...(cwd === undefined ? {} : { cwd }),
      ...(pin === undefined ? {} : { pin }),
    },
    secretEnv: {},
  };
}

const npx = (pin?: ConnectorPin, args = ["-y", npmPackage.name]) => stdio("npx", args, pin);
const uvx = (pin?: ConnectorPin, args = [pypiPackage.name]) => stdio("uvx", args, pin);

/** A connector under test, its registry and what came of starting it. */
interface Started {
  harness: PinnedConnectorHarness;
  registry: RecordedRegistryClient;
  /** The tools listed, or the error that stopped the start: from `create` or from `listTools`. */
  outcome: { listed: unknown } | { refused: unknown };
}

/** Creates a client for `config`, lists its tools once, and closes it. */
async function start(
  make: MakePinnedConnector,
  config: ConnectorConfig,
  options: { trusted?: boolean; registryDown?: boolean } = {},
): Promise<Started> {
  const harness = await make({ inheritedEnv: contractInheritedEnv });
  const registry = new RecordedRegistryClient({ down: options.registryDown ?? false });
  const trust = (options.trusted ?? true) ? contractGrant : null;
  let outcome: Started["outcome"];
  try {
    const client = harness.factory.create(config, { ...harness.context, http: registry, trust });
    try {
      outcome = { listed: await client.listTools() };
    } finally {
      await client.close();
    }
  } catch (error) {
    outcome = { refused: error };
  }
  return { harness, registry, outcome };
}

/** Expects the start to have been refused before any program started. */
function expectRefused({ harness, outcome }: Started): void {
  expect(outcome).toHaveProperty("refused");
  expect(harness.launches()).toEqual([]);
}

/**
 * Expects one program, spawned as `pin` asks, in a folder of its own: not
 * the workspace, not inside it, not around it.
 */
function expectStartedWith({ harness, outcome }: Started, pin: ConnectorPin): ConnectorLaunch {
  expect(outcome).toEqual({ listed: contractServerTools });
  const launches = harness.launches();
  expect(launches).toHaveLength(1);
  const [launch] = launches;
  if (launch === undefined) throw new Error("no program started");
  expect(launch.pin).toEqual(pin);
  expectSpawnedPinned(launch, pin);
  expectOutside(launch.folder, harness.context.workspaceRoot);
  return launch;
}

/** Expects every registry address asked for to lie under `registryUrl`. */
function expectAskedOnlyAt({ registry }: Started, registryUrl: string): void {
  expect(registry.asked().length).toBeGreaterThan(0);
  for (const url of registry.asked()) expect(url.startsWith(`${registryUrl}/`)).toBe(true);
}

/**
 * The contract every `stdio` {@link ConnectorFactory} passes for connector
 * pinning (`pin` on the stdio transport): it starts exactly the pinned
 * package and version, looks it up only at the pin's `registryUrl`, starts
 * in a folder of its own, and refuses any other version. Registry lookups
 * get recorded npm and PyPI answers through the context's `http`, never
 * the network.
 */
export function connectorPinContract(name: string, make: MakePinnedConnector): void {
  verifies("contracts.connector-pin", () => {
    describe(`Connector pinning contract: ${name}`, () => {
      startCases(make);
      registryCases(make);
      refusalCases(make);
      overrideCases(make);
      bypassCases(make);
    });
  });
}

function startCases(make: MakePinnedConnector): void {
  it("starts a pinned npm package at its version, in a folder of its own, looked up only at the pin's registry", async () => {
    const started = await start(make, npx(npmPin));
    expectStartedWith(started, npmPin);
    expectAskedOnlyAt(started, npmRegistryUrl);
  });

  it("starts a pinned PyPI package at its version, looked up only at the pin's registry", async () => {
    const started = await start(make, uvx(pypiPin));
    expectStartedWith(started, pypiPin);
    expectAskedOnlyAt(started, pypiRegistryUrl);
  });

  it("starts a pinned package when the command names the pin's own version", async () => {
    const started = await start(make, npx(npmPin, ["-y", `${npmPackage.name}@2.3.1`]));
    expectStartedWith(started, npmPin);
  });

  it("starts a pinned connector given a cwd in a folder of its own, not in that cwd", async () => {
    const harness = await make({ inheritedEnv: contractInheritedEnv });
    const cwd = `${harness.context.workspaceRoot}/tools/mail`;
    const config = stdio("npx", ["-y", npmPackage.name], npmPin, {}, cwd);
    const launch = expectStartedWith(await start(async () => harness, config), npmPin);
    expectOutside(launch.folder, cwd);
  });

  it("gives each client's program its own folder", async () => {
    const harness = await make({ inheritedEnv: contractInheritedEnv });
    for (let round = 0; round < 2; round += 1) {
      const registry = new RecordedRegistryClient();
      const client = harness.factory.create(npx(npmPin), {
        ...harness.context,
        http: registry,
        trust: contractGrant,
      });
      await client.listTools();
      await client.close();
    }
    const [first, second] = harness.launches();
    expect(first?.folder).not.toBe(second?.folder);
  });

  it("starts an unpinned package runner once trusted, as configured, with no registry lookup", async () => {
    const started = await start(make, npx());
    expect(started.outcome).toEqual({ listed: contractServerTools });
    const launches = started.harness.launches();
    expect(launches.map(({ pin, args }) => ({ pin, args }))).toEqual([
      { pin: null, args: ["-y", npmPackage.name] },
    ]);
    expect(started.registry.asked()).toEqual([]);
  });
}

function registryCases(make: MakePinnedConnector): void {
  it("looks a pinned package up only at the mirror the pin names, never at the public registry", async () => {
    const mirrorPin = { ...npmPin, registryUrl: npmMirrorUrl };
    const started = await start(make, npx(mirrorPin));
    expectStartedWith(started, mirrorPin);
    expectAskedOnlyAt(started, npmMirrorUrl);
  });

  for (const pin of [npmPin, pypiPin]) {
    it(`refuses a ${pin.registry} pin whose version the registry doesn't list`, async () => {
      const config = pin.registry === "npm" ? npx : uvx;
      expectRefused(await start(make, config({ ...pin, version: "2.3.5" })));
    });
  }

  for (const pin of [
    { ...npmPin, registryUrl: npmTamperedUrl },
    { ...pypiPin, registryUrl: pypiTamperedUrl },
  ]) {
    it(`refuses a ${pin.registry} pin when the registry's answer names another version`, async () => {
      const config = pin.registry === "npm" ? npx : uvx;
      expectRefused(await start(make, config(pin)));
    });
  }

  it("refuses to start when the registry can't be reached", async () => {
    expectRefused(await start(make, npx(npmPin), { registryDown: true }));
  });

  it("refuses a pin for a package the registry doesn't hold", async () => {
    const pin = { ...npmPin, package: "@acme/other-mcp" };
    expectRefused(await start(make, npx(pin, ["-y", "@acme/other-mcp"])));
  });

  it("without a trust grant, neither looks a pinned package up nor starts it", async () => {
    const started = await start(make, npx(npmPin), { trusted: false });
    expectRefused(started);
    expect(started.registry.asked()).toEqual([]);
  });
}

function refusalCases(make: MakePinnedConnector): void {
  const otherVersions: [string, ConnectorConfig][] = [
    ["npx @acme/mail-mcp@3.0.0", npx(npmPin, ["-y", `${npmPackage.name}@3.0.0`])],
    [
      "npx --package @acme/mail-mcp@latest",
      npx(npmPin, ["--package", `${npmPackage.name}@latest`, "mail-mcp"]),
    ],
    ["uvx mail-mcp==3.0.0", uvx(pypiPin, [`${pypiPackage.name}==3.0.0`])],
    ["uvx --from Mail_MCP==3.0.0", uvx(pypiPin, ["--from", "Mail_MCP==3.0.0", "mail-mcp"])],
    ["npx @acme/other-mcp", npx(npmPin, ["-y", "@acme/other-mcp"])],
  ];
  for (const [command, config] of otherVersions) {
    it(`refuses a pinned command that asks for another version or package: ${command}`, async () => {
      expectRefused(await start(make, config));
    });
  }

  for (const version of ["latest", "^2.3.1", ">=2", "2.3"]) {
    it(`refuses a pin whose version isn't one exact version: ${version}`, async () => {
      const started = await start(make, npx({ ...npmPin, version }));
      expectRefused(started);
      expect(started.registry.asked()).toEqual([]);
    });
  }

  const blockedEnv: Record<string, string>[] = [
    { NODE_OPTIONS: "--require ./evil.js" },
    { node_options: "--require ./evil.js" },
    { NPM_CONFIG_REGISTRY: "https://evil.test" },
    { npm_config_registry: "https://evil.test" },
    { UV_INDEX_URL: "https://evil.test/simple" },
    { PIP_INDEX_URL: "https://evil.test/simple" },
    { PYTHONPATH: "./evil" },
  ];
  for (const env of blockedEnv) {
    const [variable] = Object.keys(env);
    it(`refuses a pinned connector whose env sets ${variable}`, async () => {
      const config = stdio("npx", ["-y", npmPackage.name], npmPin, env);
      expectRefused(await start(make, config));
    });
  }
}

function overrideCases(make: MakePinnedConnector): void {
  for (const { registry, command, args } of overridingCommands) {
    it(`refuses a pinned command with a registry option: ${command} ${args.join(" ")}`, async () => {
      const pin = registry === "npm" ? npmPin : pypiPin;
      expectRefused(await start(make, stdio(command, [...args], pin)));
    });
  }

  for (const env of overridingEnv) {
    const [variable] = Object.keys(env);
    it(`refuses a pinned connector whose env sets the proxy, certificate or preload ${variable}`, async () => {
      const config = stdio("npx", ["-y", npmPackage.name], npmPin, { ...env });
      expectRefused(await start(make, config));
    });
  }

  it("starts an unpinned package runner with a registry option and a proxy once trusted, as configured", async () => {
    const args = ["--registry=https://npm.acme.test", "-y", npmPackage.name];
    const env = { HTTPS_PROXY: "http://proxy.acme.test:3128" };
    const started = await start(make, stdio("npx", args, undefined, env));
    expect(started.outcome).toEqual({ listed: contractServerTools });
    const launches = started.harness.launches();
    expect(launches.map(({ pin, args }) => ({ pin, args }))).toEqual([{ pin: null, args }]);
    expect(launches[0]?.env).toMatchObject(env);
  });
}

function bypassCases(make: MakePinnedConnector): void {
  for (const { registry, command, args } of bypassingCommands) {
    it(`refuses a pinned command that gets around the pin: ${command} ${args.join(" ")}`, async () => {
      const pin = registry === "npm" ? npmPin : pypiPin;
      expectRefused(await start(make, stdio(command, [...args], pin)));
    });
  }

  for (const env of bypassingEnv) {
    const [variable] = Object.keys(env);
    it(`refuses a pinned connector whose env moves the config home or program lookup: ${variable}`, async () => {
      const config = stdio("npx", ["-y", npmPackage.name], npmPin, { ...env });
      expectRefused(await start(make, config));
    });
  }

  for (const { registry, command, args } of packageOptionCommands) {
    it(`starts a pinned command whose package option runs the pinned package: ${command} ${args.join(" ")}`, async () => {
      const pin = registry === "npm" ? npmPin : pypiPin;
      expectStartedWith(await start(make, stdio(command, [...args], pin)), pin);
    });
  }
}
