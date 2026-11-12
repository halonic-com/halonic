import { join } from "node:path";
import { sweepRunSocketFolders } from "@halonicjs/adapter-harness-bridge";

/**
 * Where the host's bridges serve their Unix sockets, each run in a folder of
 * its own: `bridges` in the profile folder, which the sandbox hides from the
 * program. Its path stays short, as macOS takes socket paths of at most 103
 * bytes.
 *
 * Only on Linux (WSL's distro included) and macOS: there the program can't
 * reach a loopback port of the host at all, as srt keeps it in a network of
 * its own (bubblewrap) or lets it reach srt's proxy only (Seatbelt), and srt's
 * proxy sends the bridge's name to the socket instead (HAL-6316, HAL-6348).
 * Windows keeps the loopback port until srt-win is checked (HAL-6403), and so
 * does a host started without a profile folder.
 *
 * @returns the folder, or `undefined` for a bridge on a loopback port
 */
export function bridgeSocketFolder(
  profileFolder: string | undefined,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  if (profileFolder === undefined) return undefined;
  if (platform !== "linux" && platform !== "darwin") return undefined;
  return join(profileFolder, "bridges");
}

/**
 * Removes the run folders in `folder` that bridges left when their host
 * crashed or was killed, so they don't pile up (HAL-7302). Only the host that
 * holds the profile's lock sweeps, once, before it serves; the sweep leaves
 * the folders of another host's live bridges (see {@link sweepRunSocketFolders}).
 * Never throws: a sweep that fails says why with `warn`, and the host serves.
 */
export async function sweepLeftOverBridges(
  folder: string,
  warn: (message: string) => void,
): Promise<void> {
  try {
    await sweepRunSocketFolders(folder);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    warn(`Left-over bridge folders weren't removed: ${why}\n`);
  }
}
