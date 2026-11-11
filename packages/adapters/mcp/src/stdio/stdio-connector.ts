import { resolve } from "node:path";
import type { StdioTransport as StdioConfig } from "@halonicjs/app";
import type {
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
  ConnectorTool,
} from "@halonicjs/ports";
import { type Clock, SecretScrubber, systemClock } from "@halonicjs/std";
import { findRunner, type RunnerSearch } from "../pinned/find-runner.ts";
import type { LaunchFolders } from "../pinned/launch-folders.ts";
import { checkPinnedLaunch, pinnedLaunch } from "../pinned/pinned-launch.ts";
import { McpError } from "../protocol/errors.ts";
import { type ClientInfo, McpSession } from "../protocol/session.ts";
import { cleanErrorOutput, type PersonalDetails } from "./error-output.ts";
import { inheritedSecrets } from "./inherited-secrets.ts";
import type { ProgramLaunch, ProgramStarter } from "./program.ts";
import { defaultRestartLimits, RestartLimit, type RestartLimits } from "./restart-limit.ts";
import { defaultStdioLimits, type StdioLimits, StdioTransport } from "./stdio-transport.ts";
import { ConnectorStoppedError } from "./stopped-error.ts";
import { ConnectorToolError, resultText, toConnectorTool } from "./tool-mapping.ts";

/** What a stdio connector factory needs besides each connector's config. */
export interface McpStdioOptions {
  readonly starter: ProgramStarter;
  /** Where a pinned program starts: a new empty folder for each launch, usually `nodeLaunchFolders`. */
  readonly folders: LaunchFolders;
  /**
   * Where a pinned program's runner is looked for: the app's own
   * environment, usually `createRunnerSearch(process.env)`, kept for the
   * app's lifetime so the login shell is asked once per start.
   */
  readonly runners: RunnerSearch;
  /** The environment a program inherits, usually the app's own `process.env`. */
  readonly inheritedEnv: Readonly<Record<string, string | undefined>>;
  /** How Halonic introduces itself to the server. */
  readonly clientInfo: ClientInfo;
  readonly limits?: StdioLimits;
  /** How often a program that stopped may start again, {@link defaultRestartLimits} unless given. */
  readonly restartLimits?: RestartLimits;
  /** For the restart limit's window, `systemClock` unless given. */
  readonly clock?: Clock;
}

/**
 * Creates MCP connectors that start a local program and talk to it over
 * its standard input and output.
 *
 * A package runner with a `pin`, such as `npx` or `uvx`, starts through the
 * pinned launcher: exactly the pin's version, looked up only at the pin's
 * registry, in an empty folder of its own (`mcp.pinned-launcher`), as the
 * runner found in the app's own environment (`mcp.runner-lookup`). Without
 * a pin it starts as configured, like any trusted program.
 *
 * When the program stops after it started, the call that was waiting fails
 * and is not tried again, since it may already have had an effect. The next
 * call starts the program again, through the same checks, up to the
 * restart limit; past it the connector stays stopped
 * (`mcp.stdio-restart`).
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
    // This factory starts programs on this computer. A context with a sandbox
    // must start its program in that session only, so it is refused here.
    if (context.sandbox !== undefined) {
      throw new Error(
        `Connector "${config.id}" must start in its sandbox session, and this factory starts programs outside the sandbox.`,
      );
    }
    return new McpStdioConnector(config, config.transport, context, this.#options);
  }
}

/** A started program and the session with it. */
interface Connection {
  readonly session: McpSession;
  readonly transport: StdioTransport;
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
  readonly #restarts: RestartLimit;
  /** Every secret given to the program or inherited by it, to remove from its error output. */
  readonly #scrubber = new SecretScrubber();
  #connecting: Promise<Connection> | undefined;
  /** The program that is running, once its session has started. */
  #connection: Connection | undefined;
  /** The last program's transport, kept after it ended for its error output. */
  #transport: StdioTransport | undefined;
  #folder: string | undefined;
  #closed = false;
  /** Set once the restart limit is reached; the connector never starts again. */
  #stopped: ConnectorStoppedError | undefined;

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
    this.#restarts = new RestartLimit(
      options.restartLimits ?? defaultRestartLimits,
      options.clock ?? systemClock,
    );
    for (const secret of inheritedSecrets(options.inheritedEnv)) this.#scrubber.remember(secret);
  }

  async listTools(): Promise<ConnectorTool[]> {
    const { session } = await this.#connect();
    return (await session.listTools()).map(toConnectorTool);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const connection = await this.#connect();
    const result = await connection.session
      .callTool(name, args)
      .catch((error: unknown) => Promise.reject(this.#lostDuringCall(connection, name, error)));
    if (result.isError) throw new ConnectorToolError(this.id, name, resultText(result));
    return resultText(result);
  }

  async close(): Promise<void> {
    this.#closed = true;
    await this.#transport?.close();
    await this.#removeFolder();
  }

  /**
   * Starts the program on the first call, and again on the call after it
   * stopped. A start that fails is tried again on the next call.
   */
  #connect(): Promise<Connection> {
    if (this.#closed) return Promise.reject(new Error(`Connector "${this.id}" is closed.`));
    if (this.#stopped !== undefined) return Promise.reject(this.#stopped);
    if (this.#connection?.transport.ended === true) {
      this.#connection = undefined;
      this.#connecting = undefined;
    }
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
    // A program that stopped was stopped all the way by its transport; this waits for it and removes its folder.
    await this.#transport?.close();
    await this.#removeFolder();
    if (!this.#restarts.allowsStart()) {
      this.#stopped = new ConnectorStoppedError(
        this.id,
        this.#options.restartLimits ?? defaultRestartLimits,
        this.#lastErrorOutput(),
      );
      throw this.#stopped;
    }
    const planned = await this.#plan();
    this.#folder = planned.folder;
    try {
      this.#connection = await this.#run(planned.launch);
      return this.#connection;
    } catch (error) {
      // The next call plans a new launch, so this one's folder must not stay behind.
      await this.#removeFolder();
      throw error;
    }
  }

  async #run(launch: ProgramLaunch): Promise<Connection> {
    const program = await this.#options.starter.start(launch);
    // Counted once it runs: a program that can't start at all hasn't crashed.
    this.#restarts.recordStart();
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
    return { session, transport };
  }

  /**
   * The error for a call whose program stopped while it waited. The call
   * isn't tried again: the tool may already have done what it was asked.
   */
  #lostDuringCall(connection: Connection, toolName: string, error: unknown): unknown {
    if (this.#closed || !connection.transport.ended) return error;
    const reason = error instanceof McpError ? ` ${error.message}` : "";
    return new McpError(
      "unavailable",
      `Connector "${this.id}" lost its program while its tool "${toolName}" ran.${reason} Halonic didn't try the call again, because it may already have had an effect. The next call starts the program again.`,
    );
  }

  /** The last program's error output, with every secret it was given and personal data removed. */
  #lastErrorOutput(): string[] {
    const env = this.#options.inheritedEnv;
    const personal: PersonalDetails = {
      homeFolder: env["HOME"] ?? env["USERPROFILE"],
      userName: env["USER"] ?? env["USERNAME"] ?? env["LOGNAME"],
    };
    return cleanErrorOutput(this.#transport?.errorOutput() ?? [], this.#scrubber, personal);
  }

  /**
   * The program, its arguments, folder and environment, with each secret
   * only in the environment. A pin is checked, and looked up at its
   * registry, and its runner is found, before any secret is read or any
   * folder is created.
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
    const runners = this.#options.runners;
    const runner = await findRunner(this.#stdio.command, pin.value.registry, runners);
    if ("refused" in runner) {
      throw new Error(`Halonic didn't start the connector "${this.id}": ${runner.refused}.`);
    }
    const secretEnv = await this.#secretEnv();
    // The registry and the login shell take a while; a client closed meanwhile creates no folder.
    if (this.#closed) {
      throw new Error(`Connector "${this.id}" was closed while its pin was checked.`);
    }
    const folder = await this.#options.folders.create();
    const place = { folder, runner: runner.found, platform: runners.platform };
    const launch = pinnedLaunch(this.#stdio, pin.value, inheritedEnv, place);
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
      this.#scrubber.remember(value);
      values[variable] = value;
    }
    return values;
  }
}
