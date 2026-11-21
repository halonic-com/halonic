// What the plugin service gives and takes: the plugin entries `load` and
// `add` give, why it refuses to trust, add or remove a plugin, how `add`
// adds one, and the secret and sign-in calls the host passes it.

import type { Plugin } from "@halonicjs/format";
import type { PluginProblem } from "./plugin-folder.ts";
import type { PluginSource } from "./plugin-installs.ts";
import type { PluginTrustCheck } from "./plugin-trust.ts";
import type { TrustRefusal } from "./trust-record.ts";

/** A plugin folder that can't be read or checked. It gives no tools and no UI. */
export interface BrokenPlugin {
  readonly status: "broken";
  /** The plugin folder's name, in the profile's plugin folder. */
  readonly folder: string;
  /** Every problem found, for Studio's row and the CLI. Never empty. */
  readonly problems: readonly PluginProblem[];
}

/** A plugin that was read and checked, with whether it is trusted. Only `trusted` has a grant. */
export type ReadPlugin = PluginTrustCheck & {
  /** The plugin folder's name, which is the plugin's id. */
  readonly folder: string;
  /** The plugin folder's resolved real path: the trust record's key. */
  readonly location: string;
  readonly plugin: Plugin;
};

/** One plugin folder, as `PluginService.load` found it. */
export type PluginEntry = BrokenPlugin | ReadPlugin;

/** A plugin `PluginService.add` placed, as `load` gives it, and what it left out of the copy. */
export type AddedPluginEntry = PluginEntry & {
  /**
   * The paths the sandbox denies in a home folder that the source held and
   * the copy leaves out, by path from the source folder and sorted, such as
   * `.ssh` or `keys/.npmrc`. Private workspace names (`.git`, `.env`) are
   * left out too, but not named here.
   */
  readonly leftOut: readonly string[];
};

/**
 * Why a person's trust in a plugin wasn't saved: the plugin changed since
 * they were shown it, or it can't be read or checked now.
 */
export type PluginTrustRefusal =
  | TrustRefusal
  | { readonly kind: "broken"; readonly problems: readonly PluginProblem[] };

/**
 * Why a plugin wasn't added: its source can't be read or checked, or a
 * plugin with its id, in any case, is already added. Nothing was written to
 * the plugins folder.
 */
export type PluginAddRefusal =
  | { readonly kind: "broken"; readonly problems: readonly PluginProblem[] }
  | { readonly kind: "taken"; readonly id: string; readonly name: string }
  /** The source is, holds or is inside Halonic's own data (see `overlapsHalonicData`). */
  | { readonly kind: "halonic-data" };

/** How `PluginService.add` adds a plugin. */
export interface AddPluginOptions {
  /** Where the source came from, for the install record. */
  readonly from: PluginSource;
  /**
   * Put it in place of the plugin with exactly the same id, for a new
   * commit of the same plugin. Without it, an id already added is `taken`.
   */
  readonly replace: boolean;
}

/**
 * Deletes one secret from the host's `Secrets`, by the name it is stored
 * under. `Secrets` is read-only in core, so the host passes its own writer.
 * Deleting a name that isn't there must succeed, so a remove that stopped
 * part way can run again.
 */
export type DeletePluginSecret = (storedName: string) => Promise<void>;

/**
 * Why a plugin wasn't removed: one of its secrets couldn't be deleted. Its
 * trust may be gone, but its folder, settings and other secrets are kept,
 * so removing it again finishes the job.
 */
export interface PluginRemoveRefusal {
  readonly kind: "secret";
  /** The secret's name as the plugin declares it, never its value. */
  readonly secret: string;
  /** What the host's secret writer said. */
  readonly reason: string;
}

/**
 * Signs out every sign-in of the plugin `id` that has a saved grant: revokes
 * each where its approved sign-in has a revoke address, and removes its grant
 * also when the revoke fails. The grants live with the host, so the host
 * passes it. A plugin with no grant must succeed, so a remove that stopped
 * part way can run again.
 */
export type SignOutPlugin = (id: string) => Promise<void>;
