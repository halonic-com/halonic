import type { PluginLoadProblem } from "../page/plugin-pages.ts";

/** Where a new plugin comes from, as the person typed it. */
export type PluginAddSource =
  | { readonly kind: "folder"; readonly path: string }
  | { readonly kind: "git"; readonly address: string; readonly ref?: string };

/** How adding ended, when it didn't throw: core's `PluginService.add`, after the host got the source. */
export type PluginAddOutcome =
  | { readonly kind: "added"; readonly plugin: string }
  /** The plugin can't be read or checked; `name` is the manifest's, when it has one. */
  | {
      readonly kind: "broken";
      readonly name?: string;
      readonly problems: readonly PluginLoadProblem[];
    }
  | { readonly kind: "taken"; readonly plugin: string }
  | { readonly kind: "offline"; readonly host: string }
  | { readonly kind: "no-manifest" };

/**
 * What the Add plugin dialog asks the app to do. `add` throws, with a message for the person,
 * when it can't tell why; the dialog says so and that nothing was installed.
 */
export interface PluginInstaller {
  /** Copies or clones the source and adds it, not trusted. `signal` aborts when the dialog closes. */
  readonly add: (source: PluginAddSource, signal: AbortSignal) => Promise<PluginAddOutcome>;
  /** **Choose folder…**: the computer's folder picker, `undefined` when cancelled. Without it, the button is left out. */
  readonly chooseFolder?: () => Promise<string | undefined>;
}
