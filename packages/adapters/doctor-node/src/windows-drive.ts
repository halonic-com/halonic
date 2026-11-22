// The Windows drive a workspace is on under WSL, for the Workspace line's
// warning (HAL-6517): its files are slow to reach from Linux there.

/**
 * The Windows drive `path` is on under WSL, such as "/mnt/c", or `null`
 * when it is in Linux's own files. WSL mounts each drive at `/mnt/<letter>`.
 *
 * @example
 * windowsDriveOf("/mnt/c"); // "/mnt/c", and the same for every folder on it
 * windowsDriveOf("/srv/acme"); // null
 */
export function windowsDriveOf(path: string): string | null {
  return /^\/mnt\/[a-z](?=\/|$)/i.exec(path)?.[0] ?? null;
}
