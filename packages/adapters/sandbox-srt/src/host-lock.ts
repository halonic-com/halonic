import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { type HeldLock, holdLock, LockHeldError } from "@halonicjs/adapter-fs-node";

/** The lock file in the profile that the one host allowed to sweep holds while it runs. */
export function hostLockFile(profileFolder: string): string {
  return join(profileFolder, "agent-host", "host.lock");
}

/**
 * Takes the profile's host lock and holds it until it is released. The Studio
 * and the CLI can both run sessions on one profile, and a sweep would take
 * the grants of the other's live sessions, so only the holder sweeps.
 * Never throws: another live holder, or a lock that can't be taken, gives
 * `null`, and the caller then runs its sessions without a sweep.
 *
 * @param warn - where it says why it doesn't hold the lock, or lost it
 */
export async function takeHostLock(
  profileFolder: string,
  warn: (message: string) => void,
): Promise<HeldLock | null> {
  const file = hostLockFile(profileFolder);
  try {
    await mkdir(join(profileFolder, "agent-host"), { recursive: true });
    return await holdLock(file, {
      onLost: (error) => warn(`${error.message} Kept grants are no longer swept.\n`),
      onRenewError: (error) => warn(`The host lock couldn't be renewed: ${message(error)}\n`),
    });
  } catch (error) {
    const why = error instanceof LockHeldError ? error.message : message(error);
    warn(`This process doesn't sweep kept grants: ${why}\n`);
    return null;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
