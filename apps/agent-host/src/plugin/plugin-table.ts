import type { ConnectorClient } from "@halonicjs/ports";
import { PluginRefusal } from "./plugin-refusal.ts";

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
   * Starts the plugin's backend in the sandbox, checking trust again at the start.
   *
   * @throws PluginRefusal `plugin_not_trusted` or `not_fenced` when nothing may start
   */
  open(plugin: string): Promise<ConnectorClient>;
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
  #stopping = false;

  constructor(backends: PluginBackends, options: { maxPlugins?: number } = {}) {
    this.#backends = backends;
    this.#maxPlugins = options.maxPlugins ?? defaultMaxPlugins;
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
    const fingerprint = await this.#fingerprintOrStop(plugin);
    const running = await this.#runningFor(plugin, fingerprint);
    try {
      return await (await running.client).callTool(tool, args);
    } catch (error) {
      if (!this.#backends.runnerSurvives(error)) await this.#stop(plugin, running);
      throw error;
    }
  }

  /** Stops every runner, when the host stops. One that fails to stop doesn't hold the others. */
  async closeAll(): Promise<void> {
    this.#stopping = true;
    const all = [...this.#running.entries()];
    this.#running.clear();
    await Promise.allSettled(all.map(([, running]) => closeRunning(running)));
  }

  /** The current fingerprint; a plugin that isn't trusted loses its runner before the refusal. */
  async #fingerprintOrStop(plugin: string): Promise<string> {
    try {
      return await this.#backends.trustedFingerprint(plugin);
    } catch (error) {
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
    const started: RunningPlugin = { fingerprint, client: this.#backends.open(plugin) };
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
