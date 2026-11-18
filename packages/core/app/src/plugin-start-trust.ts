// The trust check before any part of a plugin starts, as `app.plugin-backend`
// and `app.plugin-local-tools` ask. Each start reads the plugin folder again
// and checks the person's trust against what is in it now, so a file changed
// after the plugin loaded never runs under the trust given before.

import type { Digest, FolderReader } from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";
import { type PluginFolder, type PluginProblem, readPluginFolder } from "./plugin-folder.ts";
import type { TrustService } from "./trust-service.ts";

/**
 * Why the trust a person gave doesn't cover what is in a plugin's folder now.
 *
 * - `unreadable`: the plugin folder can't be read or checked now; `problems` says why.
 * - `not-trusted`: a person never trusted the plugin, or took their trust back.
 * - `changed`: the manifest or a file changed since the person trusted it.
 * - `record-unreadable`: the plugin's trust record can't be read.
 * - `not-checked`: the trust check gave a status this code doesn't know, so it
 *   can't say whether the person trusted the plugin.
 */
export type PluginStartTrustReason =
  | "unreadable"
  | "not-trusted"
  | "changed"
  | "record-unreadable"
  | "not-checked";

/** A refused trust check: the reason, and for `unreadable` what is wrong with the folder. */
export interface PluginStartTrustRefusal {
  readonly reason: PluginStartTrustReason;
  readonly problems: readonly PluginProblem[];
}

/**
 * The plugin as it was read and found trusted at this start: what the person
 * trusted, and so the only files and manifest the start may run.
 */
export interface TrustedPluginFolder extends PluginFolder {
  /** The fingerprint the trust covers: the hash of the manifest and of every file in `files`. */
  readonly fingerprint: string;
}

/** Where a start reads the plugin and checks the person's trust in it. */
export interface PluginStartTrustOptions {
  /** The profile's plugin folder, which holds one folder per plugin, named by its id. */
  readonly plugins: FolderReader;
  /** For the hash of every file, the same one the trust check uses. */
  readonly digest: Digest;
  /** The `TrustService` that holds the person's trust in plugins. */
  readonly trust: Pick<TrustService, "checkPlugin">;
}

/**
 * Reads the plugin `id` as it is in the plugins folder now and checks that
 * its trust is `trusted` for exactly these files and this manifest. Any
 * other status refuses, so a status added later fails closed.
 *
 * @param id - the plugin's id, which is its folder's name
 * @throws a `RangeError` when `id` isn't a single folder name
 */
export async function checkPluginTrustNow(
  options: PluginStartTrustOptions,
  id: string,
): Promise<Result<TrustedPluginFolder, PluginStartTrustRefusal>> {
  const { plugins, digest, trust } = options;
  if (id === "" || id === "." || id === ".." || /[/\\]/u.test(id)) {
    throw new RangeError(`${JSON.stringify(id)} isn't a plugin id`);
  }
  const read = await readPluginFolder(plugins, digest, id).catch((error: unknown) =>
    err([readFailed(error)]),
  );
  if (!read.ok) return err({ reason: "unreadable", problems: read.error });
  const { plugin, location, files } = read.value;
  const check = await trust.checkPlugin({ location, plugin, files });
  if (check.status === "trusted") {
    return ok({ plugin, location, files, fingerprint: check.fingerprint });
  }
  return err({ reason: untrustedReason(check.status), problems: [] });
}

/** The reason a check that isn't `trusted` gives for refusing the start. */
function untrustedReason(
  status: Exclude<Awaited<ReturnType<TrustService["checkPlugin"]>>["status"], "trusted">,
): PluginStartTrustReason {
  switch (status) {
    case "new":
      return "not-trusted";
    case "changed":
      return "changed";
    case "unreadable":
      return "record-unreadable";
    default:
      // A status added later still refuses, but the person may have trusted
      // the plugin, so it isn't told to trust it: it needs a reason of its own.
      return "not-checked";
  }
}

function readFailed(error: unknown): PluginProblem {
  const reason = error instanceof Error ? error.message : String(error);
  return {
    code: "read-failed",
    file: "",
    path: [],
    message: `Halonic couldn't read the plugin: ${reason}.`,
  };
}
