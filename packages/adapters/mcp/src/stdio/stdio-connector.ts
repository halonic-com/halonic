import { resolve } from "node:path";
import type { StdioTransport as StdioConfig } from "@halonicjs/app";
import type {
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
  ConnectorTool,
} from "@halonicjs/ports";
import type { LaunchFolders } from "../pinned/launch-folders.ts";
import { checkPinnedLaunch, pinnedLaunch } from "../pinned/pinned-launch.ts";
import { type ClientInfo, McpSession } from "../protocol/session.ts";
import type { ProgramLaunch, ProgramStarter } from "./program.ts";
import { defaultStdioLimits, type StdioLimits, StdioTransport } from "./stdio-transport.ts";
import { ConnectorToolError, resultText, toConnectorTool } from "./tool-mapping.ts";

/** What a stdio connector factory needs besides each connector's config. */
export interface McpStdioOptions {
  readonly starter: ProgramStarter;
  /** Where a pinned program starts: a new empty folder for each launch, usually `nodeLaunchFolders`. */
  readonly folders: LaunchFolders;
  /** The environment a program inherits, usually the app's own `process.env`. */
  readonly inheritedEnv: Readonly<Record<string, string | undefined>>;
  /** How Halonic introduces itself to the server. */
  readonly clientInfo: ClientInfo;
  readonly limits?: StdioLimits;
}

/**
 * Creates MCP connectors that start a local program and talk to it over
 * its standard input and output.
 *
 * A package runner with a `pin`, such as `npx` or `uvx`, starts through the
 * pinned launcher: exactly the pin's version, looked up only at the pin's
 * registry, in an empty folder of its own (`mcp.pinned-launcher`). Without
 * a pin it starts as configured, like any trusted program.
 */
export class McpStdioConnectorFactory implements ConnectorFactory {
  readonly transport = "stdio";
  readonly #options: McpStdioOptions;

  constructor(options: McpStdioOptions) {
    this.#options = options;
  }

  create(config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient {
    if (config.transport.kind !== "stdio") {
      throw new Error(
        `Connector "${config.id}" uses ${config.transport.kind}, but this factory serves stdio.`,
      );
    }
    return new McpStdioConnector(config, config.transport, context, this.#options);
  }
}

/** A started program and the session with it. */
interface Connection {
  readonly session: McpSession;
}

/** What to start, and the launch folder to delete once it has ended, if it has one. */
interface Planned {
  readonly launch: ProgramLaunch;
  readonly folder: string | undefined;
}

class McpStdioConnector implements ConnectorClient {
  readonly id: string;
  readonly #config: ConnectorConfig;
  readonly #stdio: StdioConfig;
  readonly #context: ConnectorFactoryContext;
  readonly #options: McpStdioOptions;
  #connecting: Promise<Connection> | undefined;
  #transport: StdioTransport | undefined;
  #folder: string | undefined;
  #closed = false;

  constructor(
    config: ConnectorConfig,
    stdio: StdioConfig,
    context: ConnectorFactoryContext,
    options: McpStdioOptions,
  ) {
    this.id = config.id;
    this.#config = config;
    this.#stdio = stdio;
    this.#context = context;
    this.#options = options;
  }

  async listTools(): Promise<ConnectorTool[]> {
    const { session } = await this.#connect();
    return (await session.listTools()).map(toConnectorTool);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const { session } = await this.#connect();
    const result = await session.callTool(name, args);
    if (result.isError) throw new ConnectorToolError(this.id, name, resultText(result));
    return resultText(result);
  }

  async close(): Promise<void> {
    this.#closed = true;
    await this.#transport?.close();
    await this.#removeFolder();
  }

  /** Starts the program on the first call, once; a start that fails is tried again on the next call. */
  #connect(): Promise<Connection> {
    if (this.#closed) return Promise.reject(new Error(`Connector "${this.id}" is closed.`));
    this.#connecting ??= this.#start().catch((error: unknown) => {
      this.#connecting = undefined;
      throw error;
    });
    return this.#connecting;
  }

  async #start(): Promise<Connection> {
    // Checked before anything else, so an untrusted workspace starts nothing and reads no secret.
    if (this.#context.trust === null) {
      throw new Error(
        `Connector "${this.id}" starts a program, so it starts only once the workspace is trusted.`,
      );
    }
    const planned = await this.#plan();
    this.#folder = planned.folder;
    try {
      return await this.#run(planned.launch);
    } catch (error) {
      // The next call plans a new launch, so this one's folder must not stay behind.
      await this.#removeFolder();
      throw error;
    }
  }

  async #run(launch: ProgramLaunch): Promise<Connection> {
    const program = await this.#options.starter.start(launch);
    const transport = new StdioTransport(program, this.#options.limits ?? defaultStdioLimits);
    this.#transport = transport;
    if (this.#closed) {
      await transport.close();
      throw new Error(`Connector "${this.id}" was closed while its program started.`);
    }
    const session = new McpSession(transport, { clientInfo: this.#options.clientInfo });
    try {
      await session.initialize();
    } catch (error) {
      // The next call starts a new program, so this one must not keep running.
      await transport.close();
      throw error;
    }
    return { session };
  }

  /**
   * The program, its arguments, folder and environment, with each secret
   * only in the environment. A pin is checked, and looked up at its
   * registry, before any secret is read or any folder is created.
   */
  async #plan(): Promise<Planned> {
    const workspaceRoot = this.#context.workspaceRoot;
    if (workspaceRoot === undefined) {
      throw new Error(`Connector "${this.id}" starts a program, which can't run here.`);
    }
    const pin = await checkPinnedLaunch(this.#stdio, this.#config.secretEnv, this.#context.http);
    if (!pin.ok) {
      throw new Error(`Halonic didn't start the connector "${this.id}": ${pin.error}.`);
    }
    const inheritedEnv = this.#inheritedEnv();
    if (pin.value === null) {
      const env = { ...inheritedEnv, ...this.#stdio.env, ...(await this.#secretEnv()) };
      const cwd = resolve(workspaceRoot, this.#stdio.cwd ?? ".");
      return {
        launch: { program: this.#stdio.command, args: this.#stdio.args, env, cwd },
        folder: undefined,
      };
    }
    const secretEnv = await this.#secretEnv();
    // The registry lookup takes a while; a client closed meanwhile creates no folder.
    if (this.#closed) {
      throw new Error(`Connector "${this.id}" was closed while its pin was checked.`);
    }
    const folder = await this.#options.folders.create();
    const launch = pinnedLaunch(this.#stdio, pin.value, inheritedEnv, folder);
    return { launch: { ...launch, env: { ...launch.env, ...secretEnv } }, folder };
  }

  #inheritedEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [name, value] of Object.entries(this.#options.inheritedEnv)) {
      if (value !== undefined) env[name] = value;
    }
    return env;
  }

  async #removeFolder(): Promise<void> {
    const folder = this.#folder;
    this.#folder = undefined;
    if (folder !== undefined) await this.#options.folders.remove(folder);
  }

  async #secretEnv(): Promise<Record<string, string>> {
    const values: Record<string, string> = {};
    for (const [variable, secretName] of Object.entries(this.#config.secretEnv)) {
      const value = await this.#context.secrets.get(secretName);
      if (value === null) {
        throw new Error(
          `Connector "${this.id}" needs the secret "${secretName}", which isn't set.`,
        );
      }
      values[variable] = value;
    }
    return values;
  }
}
