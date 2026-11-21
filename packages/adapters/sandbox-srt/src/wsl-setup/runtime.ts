// The setup's `installing-runtime` step (HAL-14644): puts the runtime Studio
// ships in `/opt/halonic/<version>` with the image's runtime updater, unless
// that version is already current. The image ships the slot empty.
import { firstLine } from "./detect.ts";
import type { WslHost } from "./host.ts";

/** The image's runtime updater (`infra/wsl-image/files/halonic-runtime`). Any user may run its `status`. */
export const RUNTIME_UPDATER = "/usr/local/sbin/halonic-runtime";

/**
 * The runtime Studio ships for its distro: the archive
 * `infra/wsl-image/runtime-archive.sh` packs, and the version and SHA-256
 * from its `halonic-runtime.json`.
 */
export interface WslRuntime {
  version: string;
  /** The archive's SHA-256, as lowercase hex. */
  sha256: string;
  /** The archive's path on Windows. */
  archive: string;
}

/**
 * Why the runtime isn't in place.
 *
 * - `runtime-busy`: a sandbox session runs in the distro, so the updater changes nothing; run the setup again once it ends.
 * - `runtime-install-failed`: the updater refused the archive or failed. The same archive won't do better, so Studio needs reinstalling.
 */
export interface WslRuntimeFailure {
  code: "runtime-busy" | "runtime-install-failed";
  detail: string;
}

/** The updater's exit codes the step tells apart (see `infra/wsl-image/README.md`). */
const EXIT_WRONG_USE = 2;
const EXIT_BUSY = 3;

/**
 * The `current` version in `halonic-runtime status`'s output, or `null` when
 * there is none. Output that isn't the updater's JSON counts as none: the
 * step then installs, and the updater checks everything again as root.
 */
export function currentRuntime(output: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output.trim());
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || !("current" in parsed)) return null;
  const { current } = parsed;
  return typeof current === "string" && current !== "" ? current : null;
}

async function installedVersion(host: WslHost, distro: string): Promise<string | null> {
  const status = await host.runInDistro(distro, [RUNTIME_UPDATER, "status"]);
  return status.code === 0 ? currentRuntime(status.output) : null;
}

/**
 * Puts `runtime` in the distro unless its version is already current, so
 * running it again changes nothing. `null` when the runtime is in place.
 */
export async function ensureWslRuntime(
  host: WslHost,
  distro: string,
  runtime: WslRuntime,
): Promise<WslRuntimeFailure | null> {
  if ((await installedVersion(host, distro)) === runtime.version) return null;
  const installed = await host.installRuntime(distro, runtime);
  if (installed.code === 0) return null;
  const detail = `exit ${installed.code}: ${firstLine(installed.output)}`;
  // Exit 2 is also "already current": another start of the setup got there first.
  if (
    installed.code === EXIT_WRONG_USE &&
    (await installedVersion(host, distro)) === runtime.version
  ) {
    return null;
  }
  if (installed.code === EXIT_BUSY) return { code: "runtime-busy", detail };
  return { code: "runtime-install-failed", detail };
}
