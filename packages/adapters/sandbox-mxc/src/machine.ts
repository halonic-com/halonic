import { release, version } from "node:os";

/**
 * The part of MXC's SDK (`@microsoft/mxc-sdk/v1`) the adapter reads to learn
 * what this computer offers. Our own narrow view, so a test hands in a fake
 * SDK and every other system runs the tests without it.
 */
export interface MxcSdk {
  /** What the SDK's `getPlatformSupport()` returns, as far as the adapter reads it. */
  getPlatformSupport(): { isSupported: boolean; reason?: string; isolationTier?: string };
  /** What the SDK's `getAvailableBackends()` returns, as far as the adapter reads it. */
  getAvailableBackends(): ReadonlyArray<{
    backend: string;
    tier?: string;
    capabilities: readonly string[];
  }>;
}

/** Loads MXC's SDK. */
export type LoadMxcSdk = () => Promise<MxcSdk>;

/** Which Windows this is, as Node reads it. */
export interface WindowsRelease {
  /** The build number, such as 26200. Windows 11 starts at 22000. */
  build: number;
  /** The product name, such as "Windows 10 Pro" (Windows 11 reports "Windows 10" here too) or "Windows Server 2025 Datacenter". */
  productName: string;
}

/**
 * What MXC's SDK says about this computer: `loaded: false` with the reason
 * when the SDK can't be loaded or asked.
 */
export type MxcSupport =
  | { loaded: false; problem: string }
  | {
      loaded: true;
      /** The tier the SDK picks for a plain box: `base-container` is the one the adapter uses. `null` when the SDK says MXC can't run here. */
      tier: string | null;
      /** Whether that tier can make the bridge the box's proxy (`identitylessLoopbackProxy`), which the network policy needs. */
      loopbackProxy: boolean;
    };

/**
 * What the adapter asks of the computer it runs on. A test hands it a fake
 * one; {@link systemMachine} is the real one.
 */
export interface MxcMachine {
  /** The operating system, as Node names it (`win32`, `linux`, `darwin`). */
  platform: NodeJS.Platform;
  /** Which Windows this is. Only asked on Windows. */
  windowsRelease(): WindowsRelease;
  /** What MXC's SDK says about this computer. Only asked on Windows 11 client editions. */
  mxcSupport(): Promise<MxcSupport>;
}

/** The SDK's backend name for Windows' process container. */
const processContainer = "processcontainer";

/**
 * What `sdk` says about this computer: the tier it picks for a plain box,
 * and whether the process container on that tier can use the loopback proxy.
 *
 * @throws when the SDK's own calls throw
 */
export function supportOf(sdk: MxcSdk): MxcSupport {
  const platform = sdk.getPlatformSupport();
  const tier = platform.isSupported ? (platform.isolationTier ?? null) : null;
  const container = sdk
    .getAvailableBackends()
    .find((backend) => backend.backend === processContainer && backend.tier === tier);
  const loopbackProxy = container?.capabilities.includes("identitylessLoopbackProxy") ?? false;
  return { loaded: true, tier, loopbackProxy };
}

/**
 * The real machine. The SDK is loaded the first time it is needed, and
 * what it says is kept for the rest of the process, as the SDK keeps it too.
 *
 * @param loadSdk - loads MXC's SDK; until the adapter depends on it, the default says it isn't installed
 */
export function systemMachine(loadSdk: LoadMxcSdk = sdkNotInstalled): MxcMachine {
  let support: Promise<MxcSupport> | null = null;
  return {
    platform: process.platform,
    windowsRelease: () => windowsReleaseOf(release(), version()),
    mxcSupport: () => {
      support ??= loadSdk()
        .then(supportOf)
        .catch((error: unknown) => ({
          loaded: false as const,
          problem: `MXC's SDK can't be loaded or asked: ${error instanceof Error ? error.message : String(error)}`,
        }));
      return support;
    },
  };
}

/**
 * The build and product name from Node's `os.release()` (`10.0.26200`) and
 * `os.version()` (`Windows 10 Pro`). An unreadable build is 0, so it never
 * passes for Windows 11.
 */
export function windowsReleaseOf(osRelease: string, osVersion: string): WindowsRelease {
  const build = Number(osRelease.split(".")[2]);
  return { build: Number.isInteger(build) ? build : 0, productName: osVersion };
}

async function sdkNotInstalled(): Promise<MxcSdk> {
  throw new Error("this build of Halonic doesn't include it yet");
}
