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
  ConnectorTransport,
  SandboxBlock,
  SandboxSession,
  TrustGrant,
} from "@halonicjs/ports";
import { type Clock, systemClock } from "@halonicjs/std";
import { SandboxNotFencedError, SandboxSessionEndedError } from "./errors.ts";
import { sandboxProgram } from "./sandbox-program.ts";

type StdioConfig = Extract<ConnectorTransport, { kind: "stdio" }>;

/** An access the sandbox refused while a connector's program ran, and whose program it was. */
export interface ConnectorBlock {
  readonly connectorId: string;
  readonly block: SandboxBlock;
}

/** What a sandboxed stdio connector factory needs besides each connector's config and context. */
export interface SandboxStdioOptions {
  /** How Halonic introduces itself to the server. */
  readonly clientInfo: ClientInfo;
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
 * Halonic opens the session with the profile it built for the local tool,
 * so the program's environment, network and working folder come from the
 * profile, never from the plugin. The connector doesn't close the session:
 * the host that opened it does.
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
      config.id,
      config.transport,
      { session: context.sandbox, trust: context.trust },
      this.#options,
    );
  }
}

/** Where a connector's program runs, and whether the person trusted it. */
interface Place {
  readonly session: SandboxSession;
  readonly trust: TrustGrant | null;
}

/** A started program and the MCP session with it. */
interface Connection {
  readonly session: McpSession;
  readonly transport: StdioTransport;
}

class SandboxStdioConnector implements ConnectorClient {
  readonly id: string;
  readonly #stdio: StdioConfig;
  readonly #place: Place;
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

  constructor(id: string, stdio: StdioConfig, place: Place, options: SandboxStdioOptions) {
    this.id = id;
    this.#stdio = stdio;
    this.#place = place;
    this.#options = options;
    this.#restarts = new RestartLimit(
      options.restartLimits ?? defaultRestartLimits,
      options.clock ?? systemClock,
    );
    this.#stopBlockReports = place.session.onBlocked((block) =>
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
    this.#checkMayStart();
    // A program that stopped was stopped all the way by its transport; this waits for it.
    await this.#transport?.close();
    if (!this.#restarts.allowsStart()) {
      // Its error output isn't kept: the profile gives the program secrets it may print.
      this.#stopped = new ConnectorStoppedError(
        this.id,
        this.#options.restartLimits ?? defaultRestartLimits,
        [],
      );
      throw this.#stopped;
    }
    const process = await this.#place.session.start({
      program: this.#stdio.command,
      args: [...this.#stdio.args],
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
   * Every check before the program may start, in the order they matter:
   * nothing is started, in the session or on this computer, unless all pass.
   */
  #checkMayStart(): void {
    if (this.#place.trust === null) {
      throw new Error(
        `Connector "${this.id}" starts a program, so it starts only once its plugin is trusted.`,
      );
    }
    const ended = this.#sessionEnded();
    if (ended !== undefined) throw ended;
    const fence = this.#place.session.fence;
    if (fence.state === "not-fenced") throw new SandboxNotFencedError(this.id, fence.reason);
    // Both arrive with the profile Halonic builds for a local tool (HAL-1738, PR 3);
    // until then such a connector is refused rather than started unchecked.
    if (this.#stdio.pin !== undefined) {
      throw new Error(`Connector "${this.id}" has a pinned package, which can't start here yet.`);
    }
    if (this.#stdio.cwd !== undefined) {
      throw new Error(
        `Connector "${this.id}" names a folder to start in, but a local tool starts in the working folder Halonic chose for it.`,
      );
    }
  }

  /** The error for every call once the session has ended, or `undefined` while it is open. */
  #sessionEnded(): SandboxSessionEndedError | undefined {
    return this.#place.session.fence.state === "stopped"
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
