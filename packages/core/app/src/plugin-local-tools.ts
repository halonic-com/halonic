// A trusted plugin's local tools on this computer, as `app.plugin-local-tools`
// asks (plugins ADR, section 4; P5 plan, rules 9 and 10). Each local tool runs
// in a sandbox session Halonic opens with a profile it builds itself, never
// the plugin. Where no sandbox works, such as on Android or in the browser,
// the plugin still loads and its local tools report a load state instead of
// crashing. It reports codes, never sentences: Studio and the CLI word them.

import type {
  ConnectorCallOptions,
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
  ConnectorTool,
  Sandbox,
  SandboxFence,
  SandboxProfile,
  SandboxSession,
  SandboxUnavailableReason,
} from "@halonicjs/ports";
import type { PluginToolSet } from "./plugin-contributions.ts";

/** The tools of one local tool of a trusted plugin. */
export type LocalToolSet = PluginToolSet & { readonly part: `local:${string}` };

/**
 * Whether a plugin's local tools can run on this computer.
 *
 * - `ready`: a sandbox works here, so each local tool starts in a session of its own.
 * - `needs-desktop-app`: this host has no sandbox at all, such as Android or
 *   the browser. The plugin's other parts still work.
 * - `sandbox-unavailable`: this host has a sandbox, but it can't start on
 *   this machine; `reason` says why, as `Sandbox.check` does.
 */
export type LocalToolState =
  | { readonly kind: "ready" }
  | { readonly kind: "needs-desktop-app" }
  | { readonly kind: "sandbox-unavailable"; readonly reason: SandboxUnavailableReason };

/**
 * Why a local tool can't run: a load state other than `ready`, or
 * `sandbox-not-fenced` when the session opened without a proven fence.
 * Local tools run only fenced (plugins ADR, sections 4 and 6), so a session
 * whose fence is anything but `fenced` (`off` for the launcher, which has
 * none, `not-fenced`, or already `stopped`) is closed before any program
 * starts. Only a call finds this out, because the
 * fence is proven when a session opens, so {@link PluginLocalTools.state} never
 * reports it.
 */
export type LocalToolUnavailable =
  | Exclude<LocalToolState, { kind: "ready" }>
  | {
      readonly kind: "sandbox-not-fenced";
      readonly fence: Exclude<SandboxFence["state"], "fenced">;
    };

/** What the host built for one local tool, before its session opens. */
export interface LocalToolOpening {
  /** The connector's config, with the id {@link localToolConnectorId} gives. */
  readonly config: ConnectorConfig;
  /** The profile to open the session with, built by Halonic from the manifest and the trust record. */
  readonly profile: SandboxProfile;
}

/** What {@link PluginLocalTools} needs from the host. */
export interface PluginLocalToolsOptions {
  /** The sandbox local tools run in, or `null` on a host that has none. */
  readonly sandbox: Pick<Sandbox, "check" | "open"> | null;
  /** The factory that starts a program only in the session it is given (`connector-stdio-sandbox`). */
  readonly factory: ConnectorFactory;
  /** Everything a connector needs besides its trust grant and session, which come from here. */
  readonly context: Omit<ConnectorFactoryContext, "trust" | "sandbox">;
  /**
   * Builds the local tool's config and profile. Called before each session
   * opens, so a tool whose session ended gets a fresh working folder.
   */
  prepare(set: LocalToolSet): Promise<LocalToolOpening>;
}

/** A local tool can't run on this computer. `state` says why, for Studio and the CLI to word. */
export class LocalToolUnavailableError extends Error {
  override readonly name = "LocalToolUnavailableError";
  readonly state: LocalToolUnavailable;

  constructor(connectorId: string, state: LocalToolUnavailable) {
    super(`Local tool "${connectorId}" can't run on this computer: ${describe(state)}.`);
    this.state = state;
  }
}

/** Whether `set` is a local tool's, rather than the plugin backend's. */
export function isLocalToolSet(set: PluginToolSet): set is LocalToolSet {
  return set.part !== "backend";
}

/** The connector id of a local tool: the plugin's id and the local tool's, such as `weather:files`. */
export function localToolConnectorId(set: LocalToolSet): string {
  return `${set.plugin}:${set.part.slice("local:".length)}`;
}

/**
 * Runs a trusted plugin's local tools, each in a sandbox session of its own.
 *
 * @example
 * const local = new PluginLocalTools({ sandbox, factory, context, prepare });
 * const state = await local.state();
 * const connectors = plugins.tools(entries).filter(isLocalToolSet).map((set) => local.connector(set));
 */
export class PluginLocalTools {
  readonly #options: PluginLocalToolsOptions;

  constructor(options: PluginLocalToolsOptions) {
    this.#options = options;
  }

  /** Whether local tools can run on this computer. Never throws. */
  async state(): Promise<LocalToolState> {
    const sandbox = this.#options.sandbox;
    if (sandbox === null) return { kind: "needs-desktop-app" };
    const check = await sandbox.check();
    return check.ok ? { kind: "ready" } : { kind: "sandbox-unavailable", reason: check.reason };
  }

  /**
   * The connector for one local tool. Nothing opens until its first call.
   * Without a sandbox, its calls throw {@link LocalToolUnavailableError}.
   */
  connector(set: LocalToolSet): ConnectorClient {
    const id = localToolConnectorId(set);
    const sandbox = this.#options.sandbox;
    if (sandbox === null) return new UnavailableConnector(id, { kind: "needs-desktop-app" });
    return new SessionConnector(id, set, sandbox, this.#options);
  }
}

/** A local tool on a host without a sandbox: it loads, and each call says why it can't run. */
class UnavailableConnector implements ConnectorClient {
  readonly id: string;
  readonly #state: Exclude<LocalToolState, { kind: "ready" }>;

  constructor(id: string, state: Exclude<LocalToolState, { kind: "ready" }>) {
    this.id = id;
    this.#state = state;
  }

  listTools(): Promise<ConnectorTool[]> {
    return Promise.reject(new LocalToolUnavailableError(this.id, this.#state));
  }

  callTool(): Promise<string> {
    return Promise.reject(new LocalToolUnavailableError(this.id, this.#state));
  }

  async close(): Promise<void> {}
}

/** A session and the connector running in it. */
interface Opened {
  readonly session: SandboxSession;
  readonly client: ConnectorClient;
}

/**
 * A local tool's connector that owns its session. It opens the session on
 * the first call. Once the session has ended, because its time limit ran
 * out, it closes it and its connector, and the next call opens new ones
 * (ADR section 1.2: "starts again on the next call"). The call that found it
 * ended still fails: it may already have had an effect.
 */
class SessionConnector implements ConnectorClient {
  readonly id: string;
  readonly #set: LocalToolSet;
  readonly #sandbox: Pick<Sandbox, "check" | "open">;
  readonly #options: PluginLocalToolsOptions;
  #opening: Promise<Opened> | undefined;
  /** What {@link #opening} gave, once it has. */
  #opened: Opened | undefined;
  #closed = false;

  constructor(
    id: string,
    set: LocalToolSet,
    sandbox: Pick<Sandbox, "check" | "open">,
    options: PluginLocalToolsOptions,
  ) {
    this.id = id;
    this.#set = set;
    this.#sandbox = sandbox;
    this.#options = options;
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
    const opening = this.#opening;
    this.#opening = undefined;
    this.#opened = undefined;
    const opened = await opening?.catch(() => undefined);
    if (opened !== undefined) await closeBoth(opened);
  }

  async #use<T>(use: (client: ConnectorClient) => Promise<T>): Promise<T> {
    const opened = await this.#current();
    try {
      return await use(opened.client);
    } catch (error) {
      if (opened.session.fence.state === "stopped") await this.#retire(opened);
      throw error;
    }
  }

  /** The open session, or a new one when there is none or the last one has ended. */
  async #current(): Promise<Opened> {
    if (this.#closed) throw new Error(`Local tool "${this.id}" is closed.`);
    const opening = this.#opening;
    if (opening !== undefined) {
      const opened = await opening;
      if (opened.session.fence.state !== "stopped") return opened;
      await this.#retire(opened);
    }
    this.#opening ??= this.#open().catch((error: unknown) => {
      this.#opening = undefined;
      throw error;
    });
    return await this.#opening;
  }

  async #open(): Promise<Opened> {
    const { config, profile } = await this.#options.prepare(this.#set);
    if (config.id !== this.id) {
      throw new Error(
        `Local tool "${this.id}" was prepared as connector "${config.id}", so Halonic doesn't open it.`,
      );
    }
    let session: SandboxSession;
    try {
      session = await this.#sandbox.open(profile);
    } catch (error) {
      throw await this.#whyNotOpened(error);
    }
    if (this.#closed) {
      await session.close();
      throw new Error(`Local tool "${this.id}" was closed while its session opened.`);
    }
    const fence = session.fence.state;
    if (fence !== "fenced") {
      await session.close();
      throw new LocalToolUnavailableError(this.id, { kind: "sandbox-not-fenced", fence });
    }
    try {
      const client = this.#options.factory.create(config, {
        ...this.#options.context,
        trust: this.#set.trust,
        sandbox: session,
      });
      this.#opened = { session, client };
      return this.#opened;
    } catch (error) {
      await session.close();
      throw error;
    }
  }

  /** Forgets an ended session, and closes it and its connector. */
  async #retire(opened: Opened): Promise<void> {
    if (this.#opened === opened) {
      this.#opened = undefined;
      this.#opening = undefined;
    }
    await closeBoth(opened);
  }

  /** A sandbox that can't start here is a load state; any other failure is the error itself. */
  async #whyNotOpened(error: unknown): Promise<unknown> {
    const check = await this.#sandbox.check();
    if (check.ok) return error;
    return new LocalToolUnavailableError(this.id, {
      kind: "sandbox-unavailable",
      reason: check.reason,
    });
  }
}

async function closeBoth(opened: Opened): Promise<void> {
  await opened.client.close();
  await opened.session.close();
}

function describe(state: LocalToolUnavailable): string {
  switch (state.kind) {
    case "needs-desktop-app":
      return "it needs the desktop app, because this one has no sandbox";
    case "sandbox-unavailable":
      return `its sandbox can't start here (${state.reason})`;
    case "sandbox-not-fenced":
      return `its sandbox session has no proven fence (${state.fence})`;
  }
}
