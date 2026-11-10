import type { StdioTransport } from "@halonicjs/app";
import type {
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
  ConnectorPin,
  ConnectorTool,
} from "@halonicjs/ports";
import { checkPinnedLaunch, spawnFor } from "./connector-pin.ts";
import { copyJson } from "./copy.ts";

/** The transport kinds a {@link MemoryConnectorFactory} can stand in for. */
export type MemoryConnectorKind = ConnectorConfig["transport"]["kind"];

/**
 * The server, program or service behind a memory connector: the tools it
 * offers and how it answers a call. `answer` throws for a tool error.
 */
export interface MemoryConnectorServer {
  tools: readonly ConnectorTool[];
  answer(name: string, args: Record<string, unknown>): string;
}

/** A tool call that reached the server. */
export interface MemoryConnectorCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * A program a `stdio` connector started: its pin, or `null`, the folder it
 * started in, and the command, arguments and whole environment a real
 * launcher would spawn it with.
 */
export interface MemoryConnectorLaunch {
  pin: ConnectorPin | null;
  folder: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

/** How a {@link MemoryConnectorFactory} is set up beyond its server. */
export interface MemoryConnectorOptions {
  /** The environment its programs inherit, standing in for the process's own. */
  inheritedEnv?: Readonly<Record<string, string>>;
}

/**
 * Connectors held in memory, for tests and the browser demo. It stands in
 * for one transport kind and keeps that kind's trust-grant rules
 * (`ports.connector-trust-enforcement`): without a grant, a `stdio`
 * connector starts nothing, an `http` connector calls no tool, and the
 * built-in `google` connector calls only its `read` tools. A `stdio`
 * connector counts as a started program from its first call until it closes.
 *
 * A pinned `stdio` connector starts the way a real launcher starts it
 * (`contracts.connector-pin`): the launch must pass
 * `app.package-runner-launch`, and the pin's registry, asked through the
 * context's `http` at `registryUrl` only, must list the pinned version. It
 * then starts in a new folder of its own under `/memory/connector-folders`,
 * at the pin's version, with the pin's registry set and no inherited
 * variable that could move it.
 */
export class MemoryConnectorFactory implements ConnectorFactory {
  readonly transport: MemoryConnectorKind;
  readonly #server: MemoryConnectorServer;
  readonly #reached: MemoryConnectorCall[] = [];
  readonly #launches: MemoryConnectorLaunch[] = [];
  readonly #inheritedEnv: Readonly<Record<string, string>>;
  #running = 0;

  constructor(
    transport: MemoryConnectorKind,
    server: MemoryConnectorServer,
    options: MemoryConnectorOptions = {},
  ) {
    this.transport = transport;
    this.#server = { tools: copyJson(server.tools), answer: server.answer };
    this.#inheritedEnv = { ...options.inheritedEnv };
  }

  create(config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient {
    if (config.transport.kind !== this.transport) {
      throw new TypeError(
        `Connector "${config.id}" uses ${config.transport.kind}, but this factory serves ${this.transport}.`,
      );
    }
    return new MemoryConnectorClient(config, context, this.#link());
  }

  #link(): ServerLink {
    return {
      kind: this.transport,
      inheritedEnv: this.#inheritedEnv,
      listed: () => copyJson([...this.#server.tools]),
      reach: (name, args) => {
        const call = copyJson({ name, args });
        this.#reached.push(call);
        return this.#server.answer(call.name, copyJson(call.args));
      },
      start: (launch) => {
        this.#launches.push(copyJson(launch));
        this.#running += 1;
      },
      newFolder: () => `/memory/connector-folders/${this.#launches.length + 1}`,
      stop: () => {
        this.#running -= 1;
      },
    };
  }

  /** Every tool call that reached the server so far, in order. */
  reached(): MemoryConnectorCall[] {
    return copyJson(this.#reached);
  }

  /** How many programs were started so far, and how many still run. */
  programs(): { started: number; running: number } {
    return { started: this.#launches.length, running: this.#running };
  }

  /** Every program started so far, in order. */
  launches(): MemoryConnectorLaunch[] {
    return copyJson(this.#launches);
  }
}

/** What a client may do with its factory's server and counters. */
interface ServerLink {
  readonly kind: MemoryConnectorKind;
  /** The environment a started program inherits. */
  readonly inheritedEnv: Readonly<Record<string, string>>;
  /** Tools as the server lists them, as a fresh copy. */
  listed(): ConnectorTool[];
  /** Hands a call to the server and records that it reached it. */
  reach(name: string, args: Record<string, unknown>): string;
  start(launch: MemoryConnectorLaunch): void;
  /** A folder no program of this factory has started in yet. */
  newFolder(): string;
  stop(): void;
}

class MemoryConnectorClient implements ConnectorClient {
  readonly id: string;
  readonly #config: ConnectorConfig;
  readonly #context: ConnectorFactoryContext;
  readonly #server: ServerLink;
  readonly #trusted: boolean;
  #running = false;
  /** The start of a `stdio` program, from the first call until it closes. */
  #starting: Promise<void> | undefined;

  constructor(config: ConnectorConfig, context: ConnectorFactoryContext, server: ServerLink) {
    this.id = config.id;
    this.#config = config;
    this.#context = context;
    this.#server = server;
    this.#trusted = context.trust !== null;
  }

  async listTools(): Promise<ConnectorTool[]> {
    await this.#connect();
    return this.#server.listed();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    await this.#connect();
    const tool = this.#server.listed().find((listed) => listed.name === name);
    if (tool === undefined) throw new Error(`Connector "${this.id}" has no tool "${name}".`);
    if (!this.#mayCall(tool)) {
      throw new Error(
        `Connector "${this.id}" can't call "${name}" until the workspace is trusted.`,
      );
    }
    return this.#server.reach(name, args);
  }

  async close(): Promise<void> {
    if (!this.#running) return;
    this.#running = false;
    this.#starting = undefined;
    this.#server.stop();
  }

  /**
   * Starts the program of a `stdio` connector, which needs a grant, once:
   * calls made while it starts wait for the same start. Other kinds have
   * nothing to start.
   */
  #connect(): Promise<void> {
    const transport = this.#config.transport;
    if (transport.kind !== "stdio") return Promise.resolve();
    this.#starting ??= this.#start(transport).catch((error: unknown) => {
      this.#starting = undefined;
      throw error;
    });
    return this.#starting;
  }

  async #start(transport: StdioTransport): Promise<void> {
    if (!this.#trusted) {
      throw new Error(
        `Connector "${this.id}" starts a program, so it starts only once the workspace is trusted.`,
      );
    }
    const pinned = await checkPinnedLaunch(transport, this.#context.http);
    if (!pinned.ok)
      throw new Error(`Halonic didn't start connector "${this.id}": ${pinned.error}.`);
    const pin = pinned.value;
    const folder =
      pin === null
        ? (transport.cwd ?? this.#context.workspaceRoot ?? "")
        : this.#server.newFolder();
    this.#running = true;
    this.#server.start({ pin, folder, ...spawnFor(transport, pin, this.#server.inheritedEnv) });
  }

  #mayCall(tool: ConnectorTool): boolean {
    if (this.#trusted) return true;
    // Only the built-in connector's own risk counts; a server's word doesn't.
    return this.#server.kind === "google" && tool.risk === "read";
  }
}
