// The CLI's composition root for connectors (HAL-4846): the one place it
// builds the connector factories, the HTTP client they reach servers with
// and the trust check they start behind. A command that connects a
// workspace's source, such as `halonic tools` (HAL-2827), gets them from
// here and builds nothing of its own.

import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { classifyAddress, type HostClass } from "@halonicjs/adapter-http-kit";
import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import {
  createRunnerSearch,
  McpHttpConnectorFactory,
  McpStdioConnectorFactory,
  nodeLaunchFolders,
  nodeProgramStarter,
  type ProgramStarter,
} from "@halonicjs/adapter-mcp";
import { MemoryTokenStore } from "@halonicjs/adapter-memory";
import { ConnectorFactories } from "@halonicjs/app";
import type { HttpClient, TokenStore } from "@halonicjs/ports";
import { profileFolder, trustFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import { nodeCommandSearch } from "./command-paths.ts";
import { halonicVersion } from "./version.ts";
import { nodeProfileEnvironment } from "./workspace-runs.ts";
import type { WorkspaceTrustMachine } from "./workspace-trust.ts";

/** What connecting a workspace's source uses on this computer, so tests can fix it. */
export interface ConnectorMachine extends WorkspaceTrustMachine {
  /** The factories for every transport the CLI can connect: `stdio` and `http`. */
  readonly factories: ConnectorFactories;
  /** What an `http` connector reaches its server with. */
  readonly http: HttpClient;
  /** Where sign-ins keep their tokens. */
  readonly tokens: TokenStore;
}

/**
 * The connector factories, the trust records in the profile folder
 * (`HALONIC_HOME`, or the system's data folder), the computer's clock and
 * this process's `PATH`. Build it once per command.
 *
 * @throws RangeError when `HALONIC_HOME` or the home folder isn't absolute
 */
export function nodeConnectorMachine(): ConnectorMachine {
  return {
    factories: cliConnectorFactories(nodeProgramStarter, process.env),
    http: createNodeHttpClient({ hostClass: connectorHostClass }),
    // The CLI connects no built-in Google connector yet, the only kind that reads sign-ins.
    tokens: new MemoryTokenStore(),
    trustStore: new FileTrustStore(trustFolder(profileFolder(nodeProfileEnvironment()))),
    clock: systemClock,
    commandSearch: nodeCommandSearch(),
  };
}

/**
 * The CLI's `stdio` and `http` factories. A `stdio` program starts with
 * `starter`, inheriting `env`; a pinned one is found in `env` too.
 */
export function cliConnectorFactories(
  starter: ProgramStarter,
  env: Readonly<Record<string, string | undefined>>,
): ConnectorFactories {
  const clientInfo = { name: "halonic", version: halonicVersion };
  return new ConnectorFactories([
    new McpStdioConnectorFactory({
      starter,
      folders: nodeLaunchFolders,
      runners: createRunnerSearch(env),
      inheritedEnv: env,
      clientInfo,
    }),
    new McpHttpConnectorFactory({ clientInfo }),
  ]);
}

/**
 * Where an `http` connector's address may lead: an address written as
 * numbers to its own class, `localhost` to this computer, and any other
 * name to the internet only. The address as written is what the person saw
 * when they trusted the workspace; a name that resolves to a home-network
 * address is refused, so a DNS answer can't move a request onto the
 * person's own network.
 *
 * @example
 * connectorHostClass(new URL("http://localhost:8080/mcp")); // "loopback"
 * connectorHostClass(new URL("https://notes.acme.test/mcp")); // "public"
 */
export function connectorHostClass(url: URL): HostClass | undefined {
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost") return "loopback";
  const written = addressClassOf(host);
  if (written === undefined) return "public";
  return written === "public" || written === "private" || written === "loopback"
    ? written
    : undefined;
}

/** The class of `host` when it is an IP address, or `undefined` for a name. */
function addressClassOf(host: string): ReturnType<typeof classifyAddress> | undefined {
  try {
    return classifyAddress(host);
  } catch {
    // Not an address but a name: the caller decides.
    return undefined;
  }
}
