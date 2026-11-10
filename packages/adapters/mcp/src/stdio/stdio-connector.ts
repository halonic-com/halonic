import { resolve } from "node:path";
import { isPackageRunner, type StdioTransport as StdioConfig } from "@halonicjs/app";
import type {
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
  ConnectorTool,
} from "@halonicjs/ports";
import { type ClientInfo, McpSession } from "../protocol/session.ts";
import type { ProgramLaunch, ProgramStarter } from "./program.ts";
import { defaultStdioLimits, type StdioLimits, StdioTransport } from "./stdio-transport.ts";
import { ConnectorToolError, resultText, toConnectorTool } from "./tool-mapping.ts";

/** What a stdio connector factory needs besides each connector's config. */
export interface McpStdioOptions {
  readonly starter: ProgramStarter;
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
 * A package runner, such as `npx` or `uvx`, is refused for now: it starts
 * through the pinned launcher, which comes next (HAL-230, HAL-2544).
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

class McpStdioConnector implements ConnectorClient {
  readonly id: string;
  readonly #config: ConnectorConfig;
  readonly #stdio: StdioConfig;
  readonly #context: ConnectorFactoryContext;
  readonly #options: McpStdioOptions;
  #connecting: Promise<Connection> | undefined;
  #transport: StdioTransport | undefined;
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
    if (isPackageRunner(this.#stdio.command, this.#stdio.args)) {
      throw new Error(
        `Connector "${this.id}" starts a package runner, which Halonic can't start yet.`,
      );
    }
    const launch = await this.#launch();
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

  /** The program, its arguments, folder and environment, with each secret only in the environment. */
  async #launch(): Promise<ProgramLaunch> {
    const workspaceRoot = this.#context.workspaceRoot;
    if (workspaceRoot === undefined) {
      throw new Error(`Connector "${this.id}" starts a program, which can't run here.`);
    }
    const env: Record<string, string> = {};
    for (const [name, value] of Object.entries(this.#options.inheritedEnv)) {
      if (value !== undefined) env[name] = value;
    }
    Object.assign(env, this.#stdio.env, await this.#secretEnv());
    return {
      program: this.#stdio.command,
      args: this.#stdio.args,
      env,
      cwd: resolve(workspaceRoot, this.#stdio.cwd ?? "."),
    };
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
