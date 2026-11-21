// A trusted plugin's local tools on this computer, as `app.plugin-local-tools`
// asks (plugins ADR, section 4; P5 plan, rules 9 and 10). Each local tool runs
// in a sandbox session Halonic opens with a profile it builds itself, never
// the plugin. Before each session opens it reads the plugin folder again and
// checks the person's trust against what is in it now, as a backend's start
// does (`app.plugin-backend`). Where no sandbox works, such as on Android or
// in the browser, the plugin still loads and its local tools report a load
// state instead of crashing. It reports codes, never sentences: Studio and the CLI word them.

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
import type { PluginProblem } from "./plugin-folder.ts";
import {
  checkPluginTrustNow,
  type PluginStartTrustOptions,
  type PluginStartTrustReason,
  type TrustedPluginFolder,
} from "./plugin-start-trust.ts";
import { mxcFencesLocalTools } from "./runner-fence.ts";

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
 * Why a local tool can't run: a load state other than `ready`,
 * `network-needs-srt` when MXC is in use and the tool declares a network, or
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
  | { readonly kind: "network-needs-srt" }
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
  /**
   * Removes what `prepare` made for this session, such as its folders.
   * Called once: after the session and its connector have closed, or when
   * the session didn't open or start. Its own failure is ignored.
   */
  release?(): Promise<void>;
}

/**
 * MXC as the sandbox for local tools on Windows 11, for those that declare no
 * network. Its SDK v1 has no rule per host name, so a local tool with any
 * network, or a pinned package, which is fetched from a registry, never runs
 * on it.
 */
export interface LocalToolMxc {
  /** The `sandbox-mxc` sandbox. */
  readonly sandbox: Pick<Sandbox, "check" | "open">;
  /** Whether the sandbox choice has MXC in use right now. Read before every session opens. */
  inUse(): boolean;
  /** Whether MXC counts as a fence for local tools; {@link mxcFencesLocalTools} when left out. */
  readonly fences?: boolean;
}

/** What {@link PluginLocalTools} needs from the host. */
export interface PluginLocalToolsOptions {
  /** The sandbox local tools run in, or `null` on a host that has none. */
  readonly sandbox: Pick<Sandbox, "check" | "open"> | null;
  /** MXC, for Windows 11; left out where the host has none. It stays off while {@link mxcFencesLocalTools} is `false`. */
  readonly mxc?: LocalToolMxc;
  /** The factory that starts a program only in the session it is given (`connector-stdio-sandbox`). */
  readonly factory: ConnectorFactory;
  /** Everything a connector needs besides its trust grant and session, which come from here. */
  readonly context: Omit<ConnectorFactoryContext, "trust" | "sandbox">;
  /** Where each start reads the plugin again and checks the person's trust in it. */
  readonly startTrust: PluginStartTrustOptions;
  /**
   * Builds the local tool's config and profile. Called before each session
   * opens, once the plugin was read again and found trusted, so a tool whose
   * session ended gets a fresh working folder.
   *
   * @param trusted - the plugin as it was read and checked for this session;
   *   build from it, never from a second read of the folder
   */
  prepare(set: LocalToolSet, trusted: TrustedPluginFolder): Promise<LocalToolOpening>;
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

/**
 * A local tool didn't start, because the trust a person gave doesn't cover
 * what is in its plugin's folder now, or isn't the trust it was loaded with.
 * Nothing was opened or started.
 */
export class PluginLocalToolNotTrustedError extends Error {
  override readonly name = "PluginLocalToolNotTrustedError";
  readonly plugin: string;
  readonly reason: PluginStartTrustReason;
  /** For `unreadable`, what is wrong with the folder; otherwise empty. */
  readonly problems: readonly PluginProblem[];

  constructor(
    plugin: string,
    reason: PluginStartTrustReason,
    problems: readonly PluginProblem[] = [],
  ) {
    super(notTrustedMessage(plugin, reason, problems));
    this.plugin = plugin;
    this.reason = reason;
    this.problems = problems;
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
 * Whether local tools can run with `sandbox`, the host's sandbox or `null`
 * for a host without one. {@link PluginLocalTools.state} says this, and a
 * host that only shows the state, such as the CLI's trust check, asks it
 * without opening any session. Never throws.
 *
 * @example
 * await localToolStateOf(null);
 * // { kind: "needs-desktop-app" }
 */
export async function localToolStateOf(
  sandbox: Pick<Sandbox, "check"> | null,
): Promise<LocalToolState> {
  if (sandbox === null) return { kind: "needs-desktop-app" };
  const check = await sandbox.check();
  return check.ok ? { kind: "ready" } : { kind: "sandbox-unavailable", reason: check.reason };
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
  state(): Promise<LocalToolState> {
    return localToolStateOf(this.#options.sandbox);
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

/** A session, the connector running in it, and what `prepare` made for it. */
interface Opened {
  readonly session: SandboxSession;
  readonly client: ConnectorClient;
  readonly opening: LocalToolOpening;
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
    const trusted = await this.#trustedNow();
    const opening = await this.#options.prepare(this.#set, trusted);
    try {
      return await this.#openPrepared(opening);
    } catch (error) {
      await release(opening);
      throw error;
    }
  }

  /** Opens the session `prepare` built and starts the connector in it; closes the session again on any failure. */
  async #openPrepared(opening: LocalToolOpening): Promise<Opened> {
    const { config, profile } = opening;
    if (config.id !== this.id) {
      throw new Error(
        `Local tool "${this.id}" was prepared as connector "${config.id}", so Halonic doesn't open it.`,
      );
    }
    const sandbox = this.#sandboxFor(profile);
    let session: SandboxSession;
    try {
      session = await sandbox.open(profile);
    } catch (error) {
      throw await this.#whyNotOpened(sandbox, error);
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
      this.#opened = { session, client, opening };
      return this.#opened;
    } catch (error) {
      await session.close();
      throw error;
    }
  }

  /**
   * The plugin as it is in its folder now, when the person's trust covers
   * it and is still the trust this tool was loaded with. A plugin trusted
   * again after a change waits for the next load, which offers its new tools.
   */
  async #trustedNow(): Promise<TrustedPluginFolder> {
    const plugin = this.#set.plugin;
    const checked = await checkPluginTrustNow(this.#options.startTrust, plugin);
    if (!checked.ok) {
      throw new PluginLocalToolNotTrustedError(
        plugin,
        checked.error.reason,
        checked.error.problems,
      );
    }
    const { location, fingerprint } = checked.value;
    const grant = this.#set.trust;
    if (location !== grant.location || fingerprint !== grant.fingerprint) {
      throw new PluginLocalToolNotTrustedError(plugin, "changed");
    }
    return checked.value;
  }

  /** Forgets an ended session, and closes it and its connector. */
  async #retire(opened: Opened): Promise<void> {
    if (this.#opened === opened) {
      this.#opened = undefined;
      this.#opening = undefined;
    }
    await closeBoth(opened);
  }

  /**
   * The sandbox this session opens in: MXC while the sandbox choice has it in
   * use and it counts as a fence, otherwise the host's own. On MXC a tool
   * with a network of its own is refused here, because MXC's `open` would
   * refuse its profile with an error no one could word.
   */
  #sandboxFor(profile: SandboxProfile): Pick<Sandbox, "check" | "open"> {
    const mxc = this.#options.mxc;
    if (mxc === undefined || !(mxc.fences ?? mxcFencesLocalTools) || !mxc.inUse())
      return this.#sandbox;
    const { bridge, allowedSites } = profile.network;
    if (bridge !== null || allowedSites.length > 0) {
      throw new LocalToolUnavailableError(this.id, { kind: "network-needs-srt" });
    }
    return mxc.sandbox;
  }

  /** A sandbox that can't start here is a load state; any other failure is the error itself. */
  async #whyNotOpened(sandbox: Pick<Sandbox, "check" | "open">, error: unknown): Promise<unknown> {
    const check = await sandbox.check();
    if (check.ok) return error;
    return new LocalToolUnavailableError(this.id, {
      kind: "sandbox-unavailable",
      reason: check.reason,
    });
  }
}

/**
 * Closes the connector, then the session even when the connector's close throws,
 * then removes what `prepare` made for them.
 */
async function closeBoth(opened: Opened): Promise<void> {
  try {
    try {
      await opened.client.close();
    } finally {
      await opened.session.close();
    }
  } finally {
    await release(opened.opening);
  }
}

/** Calls the opening's `release`, ignoring its failure: a folder left behind mustn't hide why a call failed. */
async function release(opening: LocalToolOpening): Promise<void> {
  await opening.release?.().catch(() => undefined);
}

function describe(state: LocalToolUnavailable): string {
  switch (state.kind) {
    case "needs-desktop-app":
      return "it needs the desktop app, because this one has no sandbox";
    case "sandbox-unavailable":
      return `its sandbox can't start here (${state.reason})`;
    case "network-needs-srt":
      return "it declares a network, and the Windows 11 sandbox can't allow single sites yet";
    case "sandbox-not-fenced":
      return `its sandbox session has no proven fence (${state.fence})`;
  }
}

function notTrustedMessage(
  plugin: string,
  reason: PluginStartTrustReason,
  problems: readonly PluginProblem[],
): string {
  switch (reason) {
    case "unreadable":
      return `The plugin ${plugin}'s program doesn't start: ${problems.map((problem) => problem.message).join(" ")}`;
    case "not-trusted":
      return `The plugin ${plugin} runs a program, so it starts only once you trust it. Review and trust it with halonic trust --plugin ${plugin}.`;
    case "changed":
      return `The plugin ${plugin} changed since you trusted it, so its program doesn't start. Review what changed and trust it again with halonic trust --plugin ${plugin}.`;
    case "record-unreadable":
      return `The plugin ${plugin}'s program doesn't start: Halonic can't read its trust record. Trust it again with halonic trust --plugin ${plugin}, which writes the record again.`;
    case "not-checked":
      return `The plugin ${plugin}'s program doesn't start: Halonic couldn't check whether you trust it. See where it stands with halonic plugin list.`;
  }
}
