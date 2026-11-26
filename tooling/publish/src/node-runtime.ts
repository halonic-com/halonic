/** One entry of Node's release list, https://nodejs.org/download/release/index.json. */
export interface NodeRelease {
  /** With its "v", such as "v26.13.1". */
  readonly version: string;
  readonly security: boolean;
}

/**
 * The Node version the workspace runs and the agent host bundles: the
 * `node@runtime:<version>` entry pnpm resolves from `devEngines.runtime`
 * in the root package.json. Undefined when the lockfile has none.
 */
export function pinnedNodeRuntime(lockfile: string): string | undefined {
  return /^ {2}node@runtime:(\d+\.\d+\.\d+):$/m.exec(lockfile)?.[1];
}

function parts(version: string): [number, number, number] | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

function compare(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/**
 * The newest security release in the pinned version's major line that is
 * newer than the pin, or undefined when the pin has every security fix of
 * its line. A newer major line doesn't count: moving to it is a choice,
 * not a fix.
 */
export function newerSecurityRelease(
  pinned: string,
  releases: readonly NodeRelease[],
): NodeRelease | undefined {
  const pin = parts(pinned);
  if (!pin) throw new Error(`"${pinned}" is not a Node version.`);
  let newest: { release: NodeRelease; version: [number, number, number] } | undefined;
  for (const release of releases) {
    const version = parts(release.version);
    if (!release.security || !version || version[0] !== pin[0]) continue;
    if (compare(version, pin) <= 0) continue;
    if (!newest || compare(version, newest.version) > 0) newest = { release, version };
  }
  return newest?.release;
}

export interface NodeRuntimeCheck {
  readonly ok: boolean;
  /** A GitHub Actions line: `::error::`, `::warning::` or plain. */
  readonly message: string;
}

/**
 * The release check (HAL-20054): fails when Node has a security release in
 * the pinned line newer than the lockfile's pin. `readReleases` reads Node's
 * release list; when it throws or answers something that isn't a list
 * (offline, a timeout), the check warns and passes.
 */
export async function checkNodeRuntime(
  lockfile: string,
  readReleases: () => Promise<unknown>,
): Promise<NodeRuntimeCheck> {
  const pinned = pinnedNodeRuntime(lockfile);
  if (!pinned) {
    return {
      ok: false,
      message:
        "::error::pnpm-lock.yaml has no node@runtime entry. Is devEngines.runtime still set?",
    };
  }
  let releases: unknown;
  try {
    releases = await readReleases();
    if (!Array.isArray(releases)) throw new Error("the answer is not a list");
  } catch (error) {
    return {
      ok: true,
      message: `::warning::The Node security check could not run: Node's release list did not answer (${(error as Error).message}). Bundled Node is ${pinned}.`,
    };
  }
  const newer = newerSecurityRelease(pinned, releases as NodeRelease[]);
  return newer
    ? {
        ok: false,
        message: `::error::Node ${newer.version} is a security release, newer than the bundled Node ${pinned}. Raise devEngines.runtime in the root package.json and run pnpm install.`,
      }
    : { ok: true, message: `Bundled Node ${pinned} has every security release of its line.` };
}
