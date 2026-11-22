import { Worker } from "node:worker_threads";
import type { scryptAsync } from "@noble/hashes/scrypt.js";

/**
 * Noble's `scryptAsync`, run in a worker thread. Tests mock the hasher's
 * scrypt with this: the same library makes the same key, but outside the
 * thread whose coverage Vitest counts. Counting every block of scrypt's inner
 * loop makes one hash at the current settings about 13 times slower (0.2 s
 * becomes 2.4 s on a free core), and on a loaded CI runner a test of three
 * hashes ran past three minutes (HAL-15989).
 */
export const scryptInWorker: typeof scryptAsync = (password, salt, options) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./scrypt-worker.spec.ts", import.meta.url), {
      workerData: { password, salt, options },
    });
    worker.once("message", (key: Uint8Array<ArrayBuffer>) => {
      resolve(key);
      void worker.terminate();
    });
    worker.once("error", reject);
  });
