import { type FoundRunner, pinnedLaunch } from "@halonicjs/adapter-mcp";
import type {
  ConnectorPin,
  ConnectorTransport,
  SandboxCommand,
  SandboxNetwork,
  SandboxProfile,
} from "@halonicjs/ports";

/** A stdio connector's transport: what a local tool's manifest and its trust record say to start. */
export type StdioConfig = Extract<ConnectorTransport, { kind: "stdio" }>;

/**
 * Where one local tool runs, as the host set it up before it opened the
 * session. The host builds it once and hands the same value to the
 * connector, which rebuilds the profile from it to check the session's;
 * nothing in it is created again. Every path is absolute.
 */
export interface LocalToolPlace {
  /**
   * The tool's own new folder: where it starts and the one it writes to.
   * For a pinned package it comes from `LaunchFolders.create()`, so it holds
   * the empty `.npmrc` the pinned environment points npm at.
   */
  readonly workingFolder: string;
  /** A fresh private temp folder for the session. */
  readonly tempFolder: string;
  /** What the program may read but not change, such as the plugin's folder for a script. */
  readonly readOnlyPaths: readonly string[];
  /** What the program may not reach at all, such as SSH keys and Halonic's own data. */
  readonly deniedPaths: readonly string[];
  /** The Halonic bridge, or `null` for none. */
  readonly bridge: SandboxNetwork["bridge"];
  /** The hosts the manifest's `localTools[].network` lists. */
  readonly sites: readonly string[];
  /** How long the session may last, in milliseconds: Halonic's limit, never the plugin's. */
  readonly timeLimitMs: number;
  /** The `PATH` the program gets: the host's own, without anything the plugin chose. */
  readonly path: string;
  /** For a pinned package: the runner the host found for it, and on which platform. */
  readonly runner?: PinnedRunner;
}

/** A pinned package's runner, as the runner lookup found it on this computer. */
export interface PinnedRunner {
  readonly found: FoundRunner;
  readonly platform: NodeJS.Platform;
}

/** The profile to open a local tool's session with, and the command it starts in it. */
export interface LocalToolLaunch {
  readonly profile: SandboxProfile;
  readonly command: SandboxCommand;
}

/**
 * The host the public PyPI serves package files from. A `uvx` package at
 * `https://pypi.org` downloads from there, so the profile allows it too.
 */
const pypiFilesHost = "files.pythonhosted.org";

/**
 * The profile and command for one local tool. Pure: the host calls it to
 * open the session, and the connector calls it again with the same values
 * to check the session it was given.
 *
 * - The environment holds only the tool's own `env` (its settings), its
 *   secrets, and what Halonic sets: `PATH`, and its home and temp folders
 *   inside the session. Halonic's variables win over the tool's settings,
 *   and the secrets come last, as on this computer.
 * - A pinned package starts as the host's pinned launcher starts it
 *   (`mcp.pinned-launcher`), with nothing inherited but `PATH`, in the
 *   working folder, and its registry's host joins the allowed sites.
 * - The network is the bridge, the manifest's sites and the registry's
 *   host, and nothing else.
 *
 * @param pin the pin `checkPinnedLaunch` returned, or `null` for a script
 * @param secretEnv the secrets' values by variable name, as Halonic read them
 * @throws when `pin` is set but the place has no runner for it
 */
export function localToolLaunch(
  stdio: StdioConfig,
  place: LocalToolPlace,
  pin: ConnectorPin | null,
  secretEnv: Readonly<Record<string, string>>,
): LocalToolLaunch {
  const launch = pin === null ? scriptLaunch(stdio, place) : packageLaunch(stdio, place, pin);
  const profile: SandboxProfile = {
    workingFolder: place.workingFolder,
    tempFolder: place.tempFolder,
    settingsFolder: null,
    readOnlyPaths: [...place.readOnlyPaths],
    deniedPaths: [...place.deniedPaths],
    env: { ...launch.env, ...secretEnv },
    network: {
      bridge: place.bridge,
      allowedSites: unique([...place.sites, ...registrySites(pin)]),
    },
    timeLimitMs: place.timeLimitMs,
  };
  return { profile, command: launch.command };
}

/** A command and its environment before the secrets. */
interface Planned {
  readonly command: SandboxCommand;
  readonly env: Record<string, string>;
}

/** A program the person already has, such as `node` or `python`, run as configured. */
function scriptLaunch(stdio: StdioConfig, place: LocalToolPlace): Planned {
  const env = {
    ...stdio.env,
    PATH: place.path,
    HOME: place.workingFolder,
    TMPDIR: place.tempFolder,
    TEMP: place.tempFolder,
    TMP: place.tempFolder,
  };
  return { command: { program: stdio.command, args: [...stdio.args] }, env };
}

/** A pinned package, started by its runner exactly as the pinned launcher starts it on this computer. */
function packageLaunch(stdio: StdioConfig, place: LocalToolPlace, pin: ConnectorPin): Planned {
  const runner = place.runner;
  if (runner === undefined) {
    throw new Error("A pinned local tool needs the runner the host found for it.");
  }
  const launch = pinnedLaunch(
    stdio,
    pin,
    { PATH: place.path },
    { folder: place.workingFolder, runner: runner.found, platform: runner.platform },
  );
  return { command: { program: launch.program, args: [...launch.args] }, env: { ...launch.env } };
}

/** The hosts a pinned package is fetched from: its registry's, and the public PyPI's file host. */
function registrySites(pin: ConnectorPin | null): string[] {
  if (pin === null) return [];
  const host = new URL(pin.registryUrl).hostname;
  return pin.registry === "pypi" && host === "pypi.org" ? [host, pypiFilesHost] : [host];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
