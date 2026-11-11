import {
  type ClientInfo,
  ConnectorStoppedError,
  ConnectorToolError,
  defaultRestartLimits,
  defaultStdioLimits,
  McpError,
  McpSession,
  RestartLimit,
  type RestartLimits,
  resultText,
  type StdioLimits,
  StdioTransport,
  toConnectorTool,
} from "@halonicjs/adapter-mcp";
import type {
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
  ConnectorTool,
  SandboxBlock,
  SandboxSession,
} from "@halonicjs/ports";
import { type Clock, systemClock } from "@halonicjs/std";
import { SandboxNotFencedError, SandboxSessionEndedError } from "./errors.ts";
import type { LocalToolPlace, StdioConfig } from "./local-tool-launch.ts";
import { planLaunch } from "./plan-launch.ts";
import { sandboxProgram } from "./sandbox-program.ts";

/** An access the sandbox refused while a connector's program ran, and whose program it was. */
export interface ConnectorBlock {
  readonly connectorId: string;
  readonly block: SandboxBlock;
}

/** What the host set up for one local tool before it opened the tool's session. */
export interface LocalToolSetup {
  /** Where the tool runs: the place the host built the session's profile from. */
  readonly place: LocalToolPlace;
}

/** What a sandboxed stdio connector factory needs besides each connector's config and context. */
export interface SandboxStdioOptions {
  /** How Halonic introduces itself to the server. */
  readonly clientInfo: ClientInfo;
  /**
   * What the host set up for each local tool, by connector id, or
   * `undefined` for a connector it didn't set up, which then doesn't start.
   */
  readonly localTools: (connectorId: string) => LocalToolSetup | undefined;
  /**
   * Hears every access the sandbox refused a connector's program. The host
   * turns each into the run's `sandbox.blocked` event.
   */
  readonly onBlocked: (blocked: ConnectorBlock) => void;
  readonly limits?: StdioLimits;
  /** How often a program that stopped may start again, `defaultRestartLimits` unless given. */
  readonly restartLimits?: RestartLimits;
  /** For the restart limit's window, `systemClock` unless given. */
  readonly clock?: Clock;
}

/**
 * Creates MCP connectors for a plugin's local tools: each starts its
 * program in the context's sandbox session and talks MCP to it over the
 * program's standard input and output. It never starts a program on this
 * computer.
 *
 * - Without a session in the context, `create` refuses the connector.
 * - Without a trust grant, or while the session's fence proof isn't
 *   `fenced`, the connector starts nothing ({@link SandboxNotFencedError}).
 * - Once the session has ended, every call throws
 *   {@link SandboxSessionEndedError}; the host opens a new session and
 *   connector.
 *
 * Halonic opens the session with the profile `localToolLaunch` built for
 * the local tool, so the program's environment, network and working folder
 * come from Halonic, never from the plugin. Before each start the connector
 * checks the launch again (`planLaunch`): the pin rules, the secrets, and
 * that the session's profile is exactly that one. The connector doesn't
 * close the session: the host that opened it does.
 *
 * As on this computer, a program that stops fails the call that waited, and
 * the next call starts it again in the same session, up to the restart limit.
 */
export class SandboxStdioConnectorFactory implements ConnectorFactory {
  readonly transport = "stdio";
  readonly #options: SandboxStdioOptions;

  constructor(options: SandboxStdioOptions) {
    this.#options = options;
  }

  create(config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient {
    if (config.transport.kind !== "stdio") {
      throw new Error(
        `Connector "${config.id}" uses ${config.transport.kind}, but this factory serves stdio.`,
      );
    }
    if (context.sandbox === undefined) {
      throw new Error(
        `Connector "${config.id}" is a local tool, which starts only in a sandbox session, and it was given none.`,
      );
    }
    return new SandboxStdioConnector(
      config,
      config.transport,
      { ...context, sandbox: context.sandbox },
      this.#options,
    );
  }
}

/** A factory context that has its session. */
type SandboxContext = ConnectorFactoryContext & { readonly sandbox: SandboxSession };

/** A started program and the MCP session with it. */
interface Connection {
  readonly session: McpSession;
  readonly transport: StdioTransport;
}

class SandboxStdioConnector implements ConnectorClient {
  readonly id: string;
  readonly #config: ConnectorConfig;
  readonly #stdio: StdioConfig;
  readonly #context: SandboxContext;
  readonly #options: SandboxStdioOptions;
  readonly #restarts: RestartLimit;
  readonly #stopBlockReports: () => void;
  #connecting: Promise<Connection> | undefined;
  /** The program that is running, once its MCP session has started. */
  #connection: Connection | undefined;
  /** The last program's transport, kept to stop it. */
  #transport: StdioTransport | undefined;
  #closed = false;
  /** Set once the restart limit is reached; the connector never starts again. */
  #stopped: ConnectorStoppedError | undefined;

  constructor(
    config: ConnectorConfig,
    stdio: StdioConfig,
    context: SandboxContext,
    options: SandboxStdioOptions,
  ) {
    const id = config.id;
    this.id = id;
    this.#config = config;
    this.#stdio = stdio;
    this.#context = context;
    this.#options = options;
    this.#restarts = new RestartLimit(
      options.restartLimits ?? defaultRestartLimits,
      options.clock ?? systemClock,
    );
    this.#stopBlockReports = context.sandbox.onBlocked((block) =>
      options.onBlocked({ connectorId: id, block }),
    );
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

  /** Stops the program and the block reports. The session stays open: its owner closes it. */
  async close(): Promise<void> {
    this.#closed = true;
    this.#stopBlockReports();
    await this.#transport?.close();
  }

  /**
   * Starts the program on the first call, and again on the call after it
   * stopped. A start that fails is tried again on the next call.
   */
  #connect(): Promise<Connection> {
    if (this.#closed) return Promise.reject(new Error(`Connector "${this.id}" is closed.`));
    // Before the restart limit: an ended session is what the host must hear, to open a new one.
    const ended = this.#sessionEnded();
    if (ended !== undefined) return Promise.reject(ended);
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
    this.#checkSession();
    // A program that stopped was stopped all the way by its transport; this waits for it.
    await this.#transport?.close();
    // Before the launch check, so a start the limit refuses reads no secret and looks nothing up.
    if (!this.#restarts.allowsStart()) {
      // Its error output isn't kept: the profile gives the program secrets it may print.
      this.#stopped = new ConnectorStoppedError(
        this.id,
        this.#options.restartLimits ?? defaultRestartLimits,
        [],
      );
      throw this.#stopped;
    }
    const command = await planLaunch({
      config: this.#config,
      stdio: this.#stdio,
      place: this.#options.localTools(this.id)?.place,
      session: this.#context.sandbox,
      context: this.#context,
    });
    // The registry lookup takes a while; a connector closed meanwhile starts nothing.
    if (this.#closed) {
      throw new Error(`Connector "${this.id}" was closed while its launch was checked.`);
    }
    // A session that ended meanwhile is what the host must hear, to open a new one.
    const ended = this.#sessionEnded();
    if (ended !== undefined) throw ended;
    const process = await this.#context.sandbox.start(command).catch((error: unknown) => {
      throw this.#sessionEnded() ?? error;
    });
    // Counted once it runs: a program that can't start at all hasn't crashed.
    this.#restarts.recordStart();
    const transport = new StdioTransport(
      sandboxProgram(process),
      this.#options.limits ?? defaultStdioLimits,
    );
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
      throw this.#sessionEnded() ?? error;
    }
    this.#connection = { session, transport };
    return this.#connection;
  }

  /**
   * The checks of the trust grant and the session, before anything else:
   * without a grant or a proven fence nothing is read, looked up or
   * started, in the session or on this computer.
   */
  #checkSession(): void {
    if (this.#context.trust === null) {
      throw new Error(
        `Connector "${this.id}" starts a program, so it starts only once its plugin is trusted.`,
      );
    }
    const ended = this.#sessionEnded();
    if (ended !== undefined) throw ended;
    const fence = this.#context.sandbox.fence;
    if (fence.state === "not-fenced") throw new SandboxNotFencedError(this.id, fence.reason);
  }

  /** The error for every call once the session has ended, or `undefined` while it is open. */
  #sessionEnded(): SandboxSessionEndedError | undefined {
    return this.#context.sandbox.fence.state === "stopped"
      ? new SandboxSessionEndedError(this.id)
      : undefined;
  }

  /**
   * The error for a call whose program stopped while it waited. The call
   * isn't tried again: the tool may already have done what it was asked.
   */
  #lostDuringCall(connection: Connection, toolName: string, error: unknown): unknown {
    if (this.#closed || !connection.transport.ended) return error;
    const ended = this.#sessionEnded();
    if (ended !== undefined) return ended;
    const reason = error instanceof McpError ? ` ${error.message}` : "";
    return new McpError(
      "unavailable",
      `Connector "${this.id}" lost its program while its tool "${toolName}" ran.${reason} Halonic didn't try the call again, because it may already have had an effect. The next call starts the program again.`,
    );
  }
}
