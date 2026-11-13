import type {
  ConnectorCallOptions,
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
  ConnectorTool,
} from "@halonicjs/ports";
import { s } from "@halonicjs/schema-kit";
import { type AgentHostTransport, readAnswer } from "./transport.ts";

const openedSchema = s.object({ connector: s.string().min(1) }).strict();

const toolsSchema = s.array(
  s
    .object({
      name: s.string(),
      description: s.string(),
      parameters: s.record(s.string(), s.unknown()),
      risk: s.enum(["read", "write", "send"]).optional(),
      untrusted: s.boolean().optional(),
    })
    .strict(),
);

const calledSchema = s.object({ text: s.string() }).strict();

const closedSchema = s.object({ closed: s.literal(true) }).strict();

/**
 * Makes the engine's `stdio` connectors stand-ins for programs the agent host
 * runs in a sandbox session of its own (D45). The engine runs in Studio's
 * page, which can't start a program, so the host starts it, builds its
 * sandbox place and holds the MCP client; Studio keeps the secrets and the
 * trust check.
 *
 * Each connector needs a trust grant and the workspace folder in its context.
 * Its secrets are read here, only the ones its own `secretEnv` names, and
 * sent with the open request: the host never reads Studio's secret store.
 */
export class AgentHostConnectorFactory implements ConnectorFactory {
  readonly transport = "stdio";
  readonly #transport: AgentHostTransport;

  constructor(transport: AgentHostTransport) {
    this.#transport = transport;
  }

  create(config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient {
    return new AgentHostConnector(this.#transport, config, context);
  }
}

/**
 * One `stdio` connector the agent host runs. The host opens it on the first
 * call, as a program starts on a connector's first call, and `close` ends it
 * there.
 */
class AgentHostConnector implements ConnectorClient {
  readonly id: string;
  readonly local = true;
  readonly #transport: AgentHostTransport;
  readonly #config: ConnectorConfig;
  readonly #context: ConnectorFactoryContext;
  #opening: Promise<string> | undefined;
  #closed = false;

  constructor(
    transport: AgentHostTransport,
    config: ConnectorConfig,
    context: ConnectorFactoryContext,
  ) {
    this.id = config.id;
    this.#transport = transport;
    this.#config = config;
    this.#context = context;
  }

  async listTools(): Promise<ConnectorTool[]> {
    const route = "POST /v1/connectors/tools";
    const connector = await this.#open();
    const answer = await this.#transport.request(route, { connector });
    return readAnswer(route, answer, toolsSchema) as ConnectorTool[];
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    options: ConnectorCallOptions = {},
  ): Promise<string> {
    const route = "POST /v1/connectors/call";
    const connector = await this.#open();
    const { idempotencyKey } = options;
    const body = {
      connector,
      tool: name,
      args,
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    };
    return readAnswer(route, await this.#transport.request(route, body), calledSchema).text;
  }

  async close(): Promise<void> {
    this.#closed = true;
    const opening = this.#opening;
    this.#opening = undefined;
    if (opening === undefined) return;
    const connector = await opening.catch(() => undefined);
    if (connector === undefined) return;
    const route = "POST /v1/connectors/close";
    const answer = await this.#transport.request(route, { connector });
    // A connector the host no longer has is as closed as one it just closed.
    if (answer.status !== 404) readAnswer(route, answer, closedSchema);
  }

  /** The host's id for this connector, opening it there on the first call. */
  #open(): Promise<string> {
    if (this.#closed) {
      return Promise.reject(new Error(`Connector "${this.id}" is closed.`));
    }
    this.#opening ??= this.#openInHost().catch((error: unknown) => {
      this.#opening = undefined;
      throw error;
    });
    return this.#opening;
  }

  async #openInHost(): Promise<string> {
    const route = "POST /v1/connectors/open";
    const { transport: stdio } = this.#config;
    if (stdio.kind !== "stdio") {
      throw new Error(`Connector "${this.id}" isn't a program, so the agent host can't run it.`);
    }
    const { workspaceRoot, trust } = this.#context;
    if (workspaceRoot === undefined) {
      throw new Error(`Connector "${this.id}" has no workspace folder to start in.`);
    }
    if (trust === null) {
      throw new Error(`Connector "${this.id}" isn't trusted, so its program doesn't start.`);
    }
    const { kind: _kind, ...file } = stdio;
    const body = {
      id: this.id,
      ...file,
      secretEnv: this.#config.secretEnv,
      secrets: await this.#readSecrets(),
      workspaceRoot,
      workingFolders: [...(this.#context.workingFolders ?? [])],
      trust,
    };
    const answer = await this.#transport.request(route, body);
    return readAnswer(route, answer, openedSchema).connector;
  }

  /**
   * The values of the secrets the connector's own `secretEnv` names, by secret name.
   *
   * @throws naming the first secret that isn't set
   */
  async #readSecrets(): Promise<Record<string, string>> {
    const values: Record<string, string> = {};
    for (const secretName of Object.values(this.#config.secretEnv)) {
      const value = await this.#context.secrets.get(secretName);
      if (value === null) {
        throw new Error(
          `Connector "${this.id}" needs the secret "${secretName}", which isn't set.`,
        );
      }
      values[secretName] = value;
    }
    return values;
  }
}
