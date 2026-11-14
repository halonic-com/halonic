import { rm } from "node:fs/promises";

/**
 * Deletes a test's temporary folder. On Windows a file the engine just
 * deleted, such as the record store's `write.lock`, can stay "delete pending"
 * for a moment, so removing its folder fails with ENOTEMPTY; `rm` tries again
 * a few times, 100 ms apart and longer each time (HAL-7129, HAL-9077).
 */
export async function removeTestFolder(folder: string): Promise<void> {
  await rm(folder, { recursive: true, force: true, maxRetries: 5 });
}
