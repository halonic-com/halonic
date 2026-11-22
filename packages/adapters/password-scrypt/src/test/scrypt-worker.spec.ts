import { parentPort, workerData } from "node:worker_threads";
import { scryptAsync } from "@noble/hashes/scrypt.js";

// Runs one noble scrypt call in its own thread for `scryptInWorker`.
const { password, salt, options } = workerData as {
  password: Uint8Array;
  salt: Uint8Array;
  options: Parameters<typeof scryptAsync>[2];
};
parentPort?.postMessage(await scryptAsync(password, salt, options));
