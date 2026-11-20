import type { CloudflareApi } from "@halonicjs/target-cloudflare-deploy";
import { eventually } from "./eventually.ts";

/** How the address is read back; tests inject `sleep`. */
export interface WorkersDevOptions {
  /** How many reads before giving up. Defaults to 6 (about 25 s). */
  readonly attempts?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

class StillOff extends Error {}

/**
 * Reads the Worker's workers.dev address after a first deploy left it on, and checks it is `host`.
 * Right after the self-test passed through that address, Cloudflare's settings can still report
 * workers.dev as off for a few seconds, so an address reported off is read again; a different
 * host is thrown at once.
 *
 * @throws Error when the address stays off, or answers to another host
 */
export async function workersDevUrlFor(
  api: CloudflareApi,
  accountId: string,
  worker: string,
  host: string,
  options: WorkersDevOptions = {},
): Promise<string> {
  let found = "";
  await eventually(
    async () => {
      const url = await api.workersDevUrl(accountId, worker);
      if (url === undefined) {
        throw new StillOff("Cloudflare still reports the Worker's workers.dev address as off.");
      }
      if (new URL(url).host !== host) {
        throw new Error(`The Worker's workers.dev address is ${url}, not the host ${host}.`);
      }
      found = url;
    },
    {
      attempts: options.attempts ?? 6,
      passesInARow: 1,
      retryIf: (error) => error instanceof StillOff,
      ...(options.sleep ? { sleep: options.sleep } : {}),
    },
  );
  return found;
}
