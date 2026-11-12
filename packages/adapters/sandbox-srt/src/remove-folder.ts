import { rm } from "node:fs/promises";

/**
 * Removes a folder this package made. On Windows a program it started can
 * still hold the folder for a moment after it exits (EBUSY), so the remove
 * retries, waiting a little longer each time, before it gives up (HAL-8071).
 */
export function removeFolder(folder: string): Promise<void> {
  return rm(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
