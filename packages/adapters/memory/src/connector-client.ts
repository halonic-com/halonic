import type {
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
  ConnectorTool,
} from "@halonicjs/ports";
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
 * Connectors held in memory, for tests and the browser demo. It stands in
 * for one transport kind and keeps that kind's trust-grant rules
 * (`ports.connector-trust-enforcement`): without a grant, a `stdio`
 * connector starts nothing, an `http` connector calls no tool, and the
 * built-in `google` connector calls only its `read` tools. A `stdio`
 * connector counts as a started program from its first call until it closes.
 */
export class MemoryConnectorFactory implements ConnectorFactory {
  readonly transport: MemoryConnectorKind;
  readonly #server: MemoryConnectorServer;
  readonly #reached: MemoryConnectorCall[] = [];
  #started = 0;
  #running = 0;

  constructor(transport: MemoryConnectorKind, server: MemoryConnectorServer) {
    this.transport = transport;
    this.#server = { tools: copyJson(server.tools), answer: server.answer };
  }

  create(config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient {
    if (config.transport.kind !== this.transport) {
      throw new TypeError(
        `Connector "${config.id}" uses ${config.transport.kind}, but this factory serves ${this.transport}.`,
      );
    }
    return new MemoryConnectorClient(config.id, this.#link(), context.trust !== null);
  }

  #link(): ServerLink {
    return {
      kind: this.transport,
      listed: () => copyJson([...this.#server.tools]),
      reach: (name, args) => {
        const call = copyJson({ name, args });
        this.#reached.push(call);
        return this.#server.answer(call.name, copyJson(call.args));
      },
      start: () => {
        this.#started += 1;
        this.#running += 1;
      },
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
    return { started: this.#started, running: this.#running };
  }
}

/** What a client may do with its factory's server and counters. */
interface ServerLink {
  readonly kind: MemoryConnectorKind;
  /** Tools as the server lists them, as a fresh copy. */
  listed(): ConnectorTool[];
  /** Hands a call to the server and records that it reached it. */
  reach(name: string, args: Record<string, unknown>): string;
  start(): void;
  stop(): void;
}

class MemoryConnectorClient implements ConnectorClient {
  readonly id: string;
  readonly #server: ServerLink;
  readonly #trusted: boolean;
  #running = false;

  constructor(id: string, server: ServerLink, trusted: boolean) {
    this.id = id;
    this.#server = server;
    this.#trusted = trusted;
  }

  async listTools(): Promise<ConnectorTool[]> {
    this.#connect();
    return this.#server.listed();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    this.#connect();
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
    this.#server.stop();
  }

  /** Starts the program of a `stdio` connector, which needs a grant. Other kinds have nothing to start. */
  #connect(): void {
    if (this.#server.kind !== "stdio" || this.#running) return;
    if (!this.#trusted) {
      throw new Error(
        `Connector "${this.id}" starts a program, so it starts only once the workspace is trusted.`,
      );
    }
    this.#running = true;
    this.#server.start();
  }

  #mayCall(tool: ConnectorTool): boolean {
    if (this.#trusted) return true;
    // Only the built-in connector's own risk counts; a server's word doesn't.
    return this.#server.kind === "google" && tool.risk === "read";
  }
}
