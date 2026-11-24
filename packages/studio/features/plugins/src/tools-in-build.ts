// Whether this build of Halonic runs plugin tools at all (C3 option (a) on HAL-12374, approved by
// the board on 24 Nov). The desktop's agent host is a single executable that refuses every plugin
// call, so there Home shows no plugin cards, Ctrl K no plugin commands, and the Plugins page says
// it once instead.

/** The line Settings › Plugins shows, once, in a build without plugin tools. */
export const NO_PLUGIN_TOOLS_LINE = "Plugin tools aren't in this build of Halonic yet.";

/** Asks the app whether this build runs plugin tools: the agent host's `GET /v1/plugins/tools`. */
export type PluginToolsInBuild = () => Promise<boolean>;

/**
 * Whether plugin tools are off in this build, as it changes once the app answered. Until then, and
 * when the app can't say, they count as on, so nothing is hidden that might work: a card then
 * shows the host's own refusal (UX check L11). `off` gives the same value until it changes, as
 * React's `useSyncExternalStore` needs.
 */
export interface PluginToolsState {
  readonly off: () => boolean;
  /** Calls `listener` when `off` changes; returns the way to stop. */
  readonly subscribe: (listener: () => void) => () => void;
}

/**
 * The state for `ask`, which is asked once, the first time Ctrl K, Home or Settings › Plugins
 * reads the state, so opening a folder (an untrusted one too) asks the agent host nothing. Without
 * `ask` (an app that can't tell, such as the CLI's served Studio), plugin tools stay on.
 *
 * @example
 * const tools = pluginToolsState(() => new AgentHostPluginTools(transport).inThisBuild());
 * if (tools.off()) return [];
 */
export function pluginToolsState(ask: PluginToolsInBuild | undefined): PluginToolsState {
  let off = false;
  let asked = false;
  const listeners = new Set<() => void>();
  const askOnce = () => {
    if (asked || ask === undefined) return;
    asked = true;
    ask().then(
      (inThisBuild) => {
        if (inThisBuild) return;
        off = true;
        for (const listener of listeners) listener();
      },
      // A host that can't say leaves the tools on: each card then says why its call failed.
      () => undefined,
    );
  };
  return {
    off: () => {
      askOnce();
      return off;
    },
    subscribe: (listener) => {
      askOnce();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The state of an app that doesn't ask: plugin tools are on. */
export const TOOLS_ON: PluginToolsState = pluginToolsState(undefined);
