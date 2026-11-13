import {
  checkPinnedLaunch,
  findRunner,
  type LaunchFolders,
  type RunnerSearch,
} from "@halonicjs/adapter-mcp";
import type {
  ConnectorCallOptions,
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
  ConnectorPin,
  ConnectorTool,
  Sandbox,
  SandboxSession,
} from "@halonicjs/ports";
import { localToolLaunch, type PinnedRunner, type StdioConfig } from "./local-tool-launch.ts";
import { readSecretEnv } from "./plan-launch.ts";
import type { WorkspaceConnectorSetup } from "./sandbox-connector.ts";
import {
  type WorkspaceConnectorSetting,
  workspaceConnectorPlace,
} from "./workspace-connector-place.ts";

/** What a host that opens its workspace connectors' sessions itself gives {@link SessionWorkspaceFactory}. */
export interface SessionWorkspaceOptions {
  /** The sandbox the sessions open in. */
  readonly sandbox: Pick<Sandbox, "check" | "open">;
  /**
   * The factory that starts a program in the session the context holds
   * (`SandboxStdioConnectorFactory`), built from the lookup it must use as
   * its `workspaceConnectors` option.
   */
  readonly sandboxed: (
    setupOf: (connectorId: string) => WorkspaceConnectorSetup | undefined,
  ) => ConnectorFactory;
  /** Starts the program on this computer, for a host whose sandbox doesn't work: today's start and trust line. */
  readonly unfenced: ConnectorFactory;
  /** Where a session's working and temp folders are made, one new folder each. */
  readonly folders: LaunchFolders;
  /** Where a pinned package's runner is looked for. */
  readonly runners: RunnerSearch;
  /** What the program may never reach, such as Halonic's own data. */
  readonly deniedPaths: readonly string[];
  /** The `PATH` the program gets: the host's own. */
  readonly path: string;
  /** How long one session may last, in milliseconds. */
  readonly timeLimitMs: number;
  /** How long one call may take, in milliseconds. */
  readonly callTimeoutMs: number;
}

/**
 * The `stdio` factory of a host that runs each workspace connector in a
 * sandbox session of its own (D45), opened by the connector itself on its
 * first call, and closed with it.
 *
 * - When the sandbox works (`Sandbox.check`), the session's profile is
 *   built here, by Halonic, from the connector file and the context: its
 *   own folders, the file's `env` and secrets, the workspace read-only,
 *   every agent working folder denied, and only the sites it names.
 * - When it doesn't, the connector starts on this computer as before
 *   (`unfenced`), under the connector file's trust line.
 * - A session that ended is closed, and the next call opens a new one with
 *   new folders.
 *
 * @example
 * const factory = new SessionWorkspaceFactory({ sandbox, sandboxed, unfenced, folders, runners, … });
 * // sandboxed: (setupOf) => new SandboxStdioConnectorFactory({ …, workspaceConnectors: setupOf })
 */
export class SessionWorkspaceFactory implements ConnectorFactory {
  readonly transport = "stdio";
  readonly #options: SessionWorkspaceOptions;

  constructor(options: SessionWorkspaceOptions) {
    this.#options = options;
  }

  create(config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient {
    if (config.transport.kind !== "stdio") {
      throw new Error(
        `Connector "${config.id}" uses ${config.transport.kind}, but this factory serves stdio.`,
      );
    }
    return new SessionWorkspaceConnector(config, config.transport, context, this.#options);
  }
}

/** A started connector and the session it runs in, if it has one. */
interface Running {
  readonly client: ConnectorClient;
  readonly session: SandboxSession | undefined;
  /** The folders made for it, to remove once it has closed. */
  readonly folders: readonly string[];
}

/** A connector that opens its session on its first call. */
class SessionWorkspaceConnector implements ConnectorClient {
  readonly id: string;
  readonly #config: ConnectorConfig;
  readonly #stdio: StdioConfig;
  readonly #context: ConnectorFactoryContext;
  readonly #options: SessionWorkspaceOptions;
  /**
   * The sandboxed factory of this connector alone: its lookup answers with this
   * connector's setup only, so runs that use the same connector never share one.
   */
  readonly #sandboxed: ConnectorFactory;
  /** What the current session was built from, for the sandboxed factory to read. */
  #setup: WorkspaceConnectorSetup | undefined;
  #starting: Promise<Running> | undefined;
  #closed = false;

  constructor(
    config: ConnectorConfig,
    stdio: StdioConfig,
    context: ConnectorFactoryContext,
    options: SessionWorkspaceOptions,
  ) {
    this.id = config.id;
    this.#config = config;
    this.#stdio = stdio;
    this.#context = context;
    this.#options = options;
    this.#sandboxed = options.sandboxed((connectorId) =>
      connectorId === this.id ? this.#setup : undefined,
    );
  }

  listTools(): Promise<ConnectorTool[]> {
    return this.#use((client) => client.listTools());
  }

  callTool(
    name: string,
    args: Record<string, unknown>,
    options?: ConnectorCallOptions,
  ): Promise<string> {
    return this.#use((client) => client.callTool(name, args, options));
  }

  /** Stops the program and closes the session. Safe to call twice. */
  async close(): Promise<void> {
    this.#closed = true;
    const starting = this.#starting;
    this.#starting = undefined;
    const running = await starting?.catch(() => undefined);
    if (running !== undefined) await this.#stop(running);
  }

  async #use<T>(use: (client: ConnectorClient) => Promise<T>): Promise<T> {
    const running = await this.#current();
    try {
      return await use(running.client);
    } catch (error) {
      // The call that found the session ended still fails: it may already have had an effect.
      if (running.session?.fence.state === "stopped") await this.#retire(running);
      throw error;
    }
  }

  async #current(): Promise<Running> {
    if (this.#closed) throw new Error(`Connector "${this.id}" is closed.`);
    const starting = this.#starting;
    if (starting !== undefined) {
      const running = await starting;
      if (running.session?.fence.state !== "stopped") return running;
      await this.#retire(running);
    }
    this.#starting ??= this.#start().catch((error: unknown) => {
      this.#starting = undefined;
      throw error;
    });
    return await this.#starting;
  }

  async #retire(running: Running): Promise<void> {
    // Only the call that finds it current stops it; a second call that saw the same ended session leaves it.
    if ((await this.#starting?.catch(() => undefined)) !== running) return;
    this.#starting = undefined;
    await this.#stop(running);
  }

  async #stop(running: Running): Promise<void> {
    await running.client.close();
    await running.session?.close();
    this.#setup = undefined;
    await Promise.allSettled(running.folders.map((path) => this.#options.folders.remove(path)));
  }

  async #start(): Promise<Running> {
    const { sandbox, unfenced } = this.#options;
    const check = await sandbox.check();
    // Without a working sandbox the program starts as before; a failing fence proof later refuses it instead.
    if (!check.ok) {
      return {
        client: unfenced.create(this.#config, this.#context),
        session: undefined,
        folders: [],
      };
    }
    // Before any folder is made, so a refused pin leaves nothing behind.
    const { pin, runner } = await this.#pinned();
    const folders: string[] = [];
    try {
      const setting = await this.#setting(folders, runner);
      const secretEnv = await readSecretEnv(this.id, this.#config.secretEnv, this.#context.secrets);
      const place = workspaceConnectorPlace(this.#stdio, setting);
      const { profile } = localToolLaunch(this.#stdio, place, pin, secretEnv);
      if (this.#closed) throw new Error(`Connector "${this.id}" is closed.`);
      const session = await sandbox.open(profile);
      this.#setup = { setting, callTimeoutMs: this.#options.callTimeoutMs };
      try {
        const context = { ...this.#context, sandbox: session };
        return { client: this.#sandboxed.create(this.#config, context), session, folders };
      } catch (error) {
        await session.close();
        throw error;
      }
    } catch (error) {
      await Promise.allSettled(folders.map((path) => this.#options.folders.remove(path)));
      throw error;
    }
  }

  /** Where this session runs: new folders, the workspace and the agents' folders from the context. */
  async #setting(
    made: string[],
    runner: PinnedRunner | undefined,
  ): Promise<WorkspaceConnectorSetting> {
    const { workspaceRoot, workingFolders } = this.#context;
    if (workspaceRoot === undefined) {
      throw new Error(
        `Connector "${this.id}" starts a program, and it was given no workspace folder.`,
      );
    }
    const workingFolder = await this.#options.folders.create();
    made.push(workingFolder);
    const tempFolder = await this.#options.folders.create();
    made.push(tempFolder);
    return {
      workingFolder,
      tempFolder,
      workspaceRoot,
      agentWorkingFolders: workingFolders ?? [],
      deniedPaths: [...this.#options.deniedPaths],
      bridge: null,
      timeLimitMs: this.#options.timeLimitMs,
      path: this.#options.path,
      ...(runner === undefined ? {} : { runner }),
    };
  }

  /** The pin and the runner found for it; both are absent for a program that isn't a pinned package. */
  async #pinned(): Promise<{ pin: ConnectorPin | null; runner?: PinnedRunner }> {
    const { runners } = this.#options;
    const checked = await checkPinnedLaunch(
      this.#stdio,
      this.#config.secretEnv,
      this.#context.http,
    );
    if (!checked.ok) {
      throw new Error(`Halonic didn't start the connector "${this.id}": ${checked.error}.`);
    }
    if (checked.value === null) return { pin: null };
    const found = await findRunner(this.#stdio.command, checked.value.registry, runners);
    if ("refused" in found) {
      throw new Error(`Halonic didn't start the connector "${this.id}": ${found.refused}.`);
    }
    return { pin: checked.value, runner: { found: found.found, platform: runners.platform } };
  }
}
