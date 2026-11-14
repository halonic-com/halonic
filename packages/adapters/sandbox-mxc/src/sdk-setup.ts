import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { type ImportMxcSdk, SdkNotDownloadedError } from "./machine.ts";
import { installFolder, installMxcSdk, isVerified, type SdkInstallOptions } from "./sdk-install.ts";
import { mxcSdkPinsFor } from "./sdk-pins.ts";

/** Where `@microsoft/mxc-sdk/v1` is, inside an install folder (the SDK's `exports["./v1"].import`). */
const sdkEntry = join("node_modules", "@microsoft", "mxc-sdk", "dist", "v1", "index.js");

/** What the host asks of the one-time SDK download. */
export interface MxcSdkSetup {
  /** Whether the verified SDK is on the disk. Never throws. */
  isDownloaded(): Promise<boolean>;
  /**
   * Downloads and verifies the SDK; nothing is fetched when it is already
   * there. One download runs at a time: a second call waits for the first and
   * gets its answer. Never throws: every failure is `done: false` with a
   * sentence for logs and support.
   */
  download(): Promise<{ done: true } | { done: false; problem: string }>;
  /** Imports the downloaded SDK; for {@link mxcSdkLoader}. Throws {@link SdkNotDownloadedError} when it isn't there. */
  importSdk: ImportMxcSdk;
}

/**
 * The SDK's download under `options.root` (inside the user's Halonic data
 * folder). Nothing is downloaded until {@link MxcSdkSetup.download} is
 * called, and the host calls it only when the person picks MXC.
 */
export function mxcSdkSetup(options: SdkInstallOptions): MxcSdkSetup {
  const pins = options.pins ?? mxcSdkPinsFor(process.arch);
  const folder = installFolder(options.root, pins);
  let running: ReturnType<MxcSdkSetup["download"]> | null = null;

  const download = async (): ReturnType<MxcSdkSetup["download"]> => {
    const result = await installMxcSdk(options);
    return result.installed ? { done: true } : { done: false, problem: result.problem };
  };

  return {
    isDownloaded: () => isVerified(folder, pins),
    download: () => {
      running ??= download().finally(() => {
        running = null;
      });
      return running;
    },
    importSdk: async () => {
      if (!(await isVerified(folder, pins))) throw new SdkNotDownloadedError();
      return import(pathToFileURL(join(folder, sdkEntry)).href);
    },
  };
}
