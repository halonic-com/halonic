import { clearTimeout, setTimeout } from "node:timers";
import type { SetTimer } from "../set-timer.ts";

/**
 * The real timer: Node's `setTimeout`. A pending wake-up keeps the process
 * running, as a server's scheduler should; `close` the scheduler to let the
 * process end.
 */
export const systemSetTimer: SetTimer = (callback, delayMs) => {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
};
