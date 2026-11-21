import type { ConnectorClient } from "@halonicjs/ports";
import { PluginRefusal } from "./plugin-refusal.ts";
import type { PluginSecretValues } from "./plugin-secret-values.ts";

/** How many plugins' backends the host keeps running at once. Each one is a sandboxed runner. */
export const defaultMaxPlugins = 8;

/** What the table needs to run a plugin's backend: the host's own trust check, and the start. */
export interface PluginBackends {
  /**
   * Reads the plugin's folder now and checks the host's own trust record
   * against what is in it, so Studio's page is never the one that says it is trusted.
   *
   * @returns the fingerprint the trust covers
   * @throws PluginRefusal `plugin_not_trusted` when it doesn't cover the plugin
   */
  trustedFingerprint(plugin: string): Promise<string>;
  /**
   * Reads the plugin's folder now, checks the trust as
   * {@link PluginBackends.trustedFingerprint} does, and gives the name each
   * secret the plugin declares is kept under: `plugin__<id>__<secret>` by
   * the declared name.
   *
   * @throws PluginRefusal `plugin_not_trusted` when the trust doesn't cover the plugin
   */
  trustedSecretNames(plugin: string): Promise<Readonly<Record<string, string>>>;
  /**
   * Opens the plugin's connector: its backend and each local tool, each
   * started in the sandbox on its first call, checking trust again at that
   * start. It refuses the open when the folder no longer has `fingerprint`,
   * the one {@link PluginBackends.trustedFingerprint} gave, so a plugin swapped
   * in between never runs. A part that can't start refuses its call instead.
   *
   * @throws PluginRefusal `plugin_not_trusted`, or `not_fenced` when nothing may start
   */
  open(plugin: string, fingerprint: string): Promise<ConnectorClient>;
  /** Whether a runner is still good after this call error, such as the tool's own error; a crash isn't. */
  runnerSurvives(error: unknown): boolean;
}

interface RunningPlugin {
  /** The trust fingerprint this runner was started under; a plugin that changed never reuses it. */
  readonly fingerprint: string;
  readonly client: Promise<ConnectorClient>;
}

/**
 * The plugins whose backend the host has running, one runner per plugin id.
 * A call checks the trust again every time: when the plugin changed since the
 * runner started, or is no longer trusted, the runner stops and the call is
 * refused or served by a new runner started under the new trust. A runner that
 * crashes leaves the table and the call fails; the next call starts a new one.
 * The runner stops itself when idle (`RunnerLimits.idleStopMs`) and starts
 * again at the next call.
 *
 * Once {@link PluginTable.closeAll} has started, the host is stopping and the table starts nothing.
 */
export class PluginTable {
  readonly #running = new Map<string, RunningPlugin>();
  readonly #backends: PluginBackends;
  readonly #maxPlugins: number;
  readonly #secretValues: PluginSecretValues | undefined;
  #stopping = false;

  /**
   * @param options.secretValues - the secrets Studio handed over; a plugin the trust no longer covers loses its own
   */
  constructor(
    backends: PluginBackends,
    options: { maxPlugins?: number; secretValues?: PluginSecretValues } = {},
  ) {
    this.#backends = backends;
    this.#maxPlugins = options.maxPlugins ?? defaultMaxPlugins;
    this.#secretValues = options.secretValues;
  }

  /** True once {@link PluginTable.closeAll} has started. */
  get isStopping(): boolean {
    return this.#stopping;
  }

  /**
   * Calls one tool of the plugin's backend.
   *
   * @throws PluginRefusal when the plugin may not run
   * @throws what the start or the call throws
   */
  async call(plugin: string, tool: string, args: Record<string, unknown>): Promise<string> {
    if (this.#stopping) throw new PluginRefusal("host_stopping");
    const fingerprint = await this.#trustedOrStop(plugin, () =>
      this.#backends.trustedFingerprint(plugin),
    );
    const running = await this.#runningFor(plugin, fingerprint);
    try {
      return await (await running.client).callTool(tool, args);
    } catch (error) {
      if (!this.#backends.runnerSurvives(error)) await this.#stop(plugin, running);
      throw error;
    }
  }

  /** Stops every runner and drops the handed-over secrets, when the host stops. A runner that fails to stop doesn't hold the others. */
  async closeAll(): Promise<void> {
    this.#stopping = true;
    this.#secretValues?.clear();
    const all = [...this.#running.entries()];
    this.#running.clear();
    await Promise.allSettled(all.map(([, running]) => closeRunning(running)));
  }

  /**
   * The name each secret the plugin declares is kept under, after the trust
   * check of a call: a plugin that isn't trusted loses its runner before the
   * refusal.
   *
   * @throws PluginRefusal `plugin_not_trusted`, or `host_stopping` once the host is stopping
   */
  async trustedSecretNames(plugin: string): Promise<Readonly<Record<string, string>>> {
    if (this.#stopping) throw new PluginRefusal("host_stopping");
    return await this.#trustedOrStop(plugin, () => this.#backends.trustedSecretNames(plugin));
  }

  /**
   * What `check` gives; a plugin it refuses loses its runner before the
   * refusal, and one the trust doesn't cover also its handed-over secrets.
   */
  async #trustedOrStop<T>(plugin: string, check: () => Promise<T>): Promise<T> {
    try {
      return await check();
    } catch (error) {
      if (error instanceof PluginRefusal && error.code === "plugin_not_trusted") {
        this.#secretValues?.forget(plugin);
      }
      const running = this.#running.get(plugin);
      if (running !== undefined) await this.#stop(plugin, running);
      throw error;
    }
  }

  async #runningFor(plugin: string, fingerprint: string): Promise<RunningPlugin> {
    if (this.#stopping) throw new PluginRefusal("host_stopping");
    const existing = this.#running.get(plugin);
    if (existing?.fingerprint === fingerprint) return existing;
    if (existing === undefined && this.#running.size >= this.#maxPlugins) {
      throw new PluginRefusal("too_many_plugins");
    }
    const started: RunningPlugin = {
      fingerprint,
      client: this.#backends.open(plugin, fingerprint),
    };
    // Set before anything waits, so calls at the same time share this one runner.
    this.#running.set(plugin, started);
    started.client.catch(() => this.#forget(plugin, started));
    if (existing !== undefined) await closeRunning(existing);
    return started;
  }

  async #stop(plugin: string, running: RunningPlugin): Promise<void> {
    this.#forget(plugin, running);
    await closeRunning(running);
  }

  /** Removes `running` unless a newer runner has taken the plugin's place. */
  #forget(plugin: string, running: RunningPlugin): void {
    if (this.#running.get(plugin) === running) this.#running.delete(plugin);
  }
}

/** A start that failed started nothing, so it has nothing to close. */
async function closeRunning(running: RunningPlugin): Promise<void> {
  await (await running.client.catch(() => undefined))?.close();
}
