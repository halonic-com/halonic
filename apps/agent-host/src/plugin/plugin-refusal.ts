/**
 * Why the host won't run a plugin's backend for a call, as the answer's
 * `error` names it. Each one starts nothing.
 *
 * - `plugin_not_trusted`: the host's own trust record doesn't cover the plugin as it is in its folder now.
 * - `not_fenced`: the sandbox that fences a plugin isn't available on this computer, such as Windows before HAL-3403.
 * - `too_many_plugins`: the table already holds the most plugins it allows.
 * - `host_stopping`: the host is stopping and starts no more plugins.
 */
export type PluginRefusalCode =
  | "plugin_not_trusted"
  | "not_fenced"
  | "too_many_plugins"
  | "host_stopping";

/** The host refused to run a plugin's backend for a call; the route answers it with the code's fixed message. */
export class PluginRefusal extends Error {
  override readonly name = "PluginRefusal";
  readonly code: PluginRefusalCode;

  constructor(code: PluginRefusalCode, detail?: string) {
    super(detail ?? code);
    this.code = code;
  }
}
