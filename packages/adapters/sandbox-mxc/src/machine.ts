import { release, version } from "node:os";
import type { MxcSpawn } from "./mxc-process.ts";

/**
 * The part of MXC's SDK (`@microsoft/mxc-sdk/v1`) the adapter uses: what this
 * computer offers, and starting a program. Our own narrow view, so a test
 * hands in a fake SDK and every other system runs the tests without it.
 */
export interface MxcSdk {
  /** What the SDK's `spawn()` does, as far as the adapter uses it. */
  spawn: MxcSpawn;
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

/** Imports the module `@microsoft/mxc-sdk/v1`, untouched. */
export type ImportMxcSdk = () => Promise<unknown>;

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
  /** Starts a program in a box, through the SDK's `spawn`. Only asked once {@link mxcSupport} said the SDK is loaded. */
  spawn: MxcSpawn;
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
 * @param loadSdk - loads MXC's SDK; the default loads it only on Windows, see {@link mxcSdkLoader}
 */
export function systemMachine(loadSdk: LoadMxcSdk = mxcSdkLoader(process.platform)): MxcMachine {
  let sdk: Promise<MxcSdk> | null = null;
  let support: Promise<MxcSupport> | null = null;
  const loaded = () => {
    sdk ??= loadSdk();
    return sdk;
  };
  return {
    platform: process.platform,
    windowsRelease: () => windowsReleaseOf(release(), version()),
    mxcSupport: () => {
      support ??= loaded()
        .then(supportOf)
        .catch((error: unknown) => ({
          loaded: false as const,
          problem: `MXC's SDK can't be loaded or asked: ${error instanceof Error ? error.message : String(error)}`,
        }));
      return support;
    },
    spawn: async (request, options) => (await loaded()).spawn(request, options),
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

/**
 * Loads MXC's SDK on Windows only, and only when it is called: never at
 * module top level, so other systems never touch the SDK or its native
 * modules. Keeps only the three calls in {@link MxcSdk}, so the adapter can't
 * reach the SDK's telemetry consent (`requestTelemetryConsent`) or anything else.
 * Every failure rejects, and {@link systemMachine} turns that into
 * `loaded: false`, which `check()` reports as `other`.
 *
 * @param platform - the operating system, as Node names it
 * @param importSdk - imports `@microsoft/mxc-sdk/v1`; until the adapter declares the SDK (HAL-7606), the default says it isn't installed
 */
export function mxcSdkLoader(
  platform: NodeJS.Platform,
  importSdk: ImportMxcSdk = sdkNotInstalled,
): LoadMxcSdk {
  return async () => {
    if (platform !== "win32") {
      throw new Error(`it runs only on Windows, and this is ${platform}`);
    }
    return mxcSdkOf(await importSdk());
  };
}

/**
 * The three calls the adapter uses from the SDK's module, and nothing else.
 *
 * @throws when the module lacks either call
 */
function mxcSdkOf(module: unknown): MxcSdk {
  const { getPlatformSupport, getAvailableBackends, spawn } =
    typeof module === "object" && module !== null ? (module as Partial<MxcSdk>) : {};
  if (
    typeof getPlatformSupport !== "function" ||
    typeof getAvailableBackends !== "function" ||
    typeof spawn !== "function"
  ) {
    throw new Error("its module has no getPlatformSupport(), getAvailableBackends() and spawn()");
  }
  return {
    getPlatformSupport: () => getPlatformSupport(),
    getAvailableBackends: () => getAvailableBackends(),
    spawn: (request, options) => spawn(request, options),
  };
}

async function sdkNotInstalled(): Promise<unknown> {
  throw new Error("this build of Halonic doesn't include it yet");
}
