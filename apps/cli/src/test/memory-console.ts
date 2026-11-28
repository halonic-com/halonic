import { ConsoleNoReplyError, ConsoleNotRunningError } from "@halonicjs/target-node-runtime";
import type { ConsoleTransport } from "../commands/serve/serve-console.ts";

/** How long the console socket's caller waits for a reply (`runtime.console-socket`). */
const replyMs = 10_000;

/**
 * The console channel in memory, by socket path, so a test runs on every system; the Unix
 * socket itself is tested in `@halonicjs/target-node-runtime` (`runtime.console-socket`).
 * Requests and replies go through JSON, as they do on the socket, and an answer that takes over
 * 10 seconds fails the call as the socket's does.
 */
export function memoryConsole(): ConsoleTransport {
  const open = new Map<string, (request: unknown) => Promise<unknown>>();
  return {
    async listen(place, answer) {
      open.set(place, answer);
      return { close: async () => void open.delete(place) };
    },
    async call(place, request) {
      const answer = open.get(place);
      if (answer === undefined) throw new ConsoleNotRunningError();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ConsoleNoReplyError()), replyMs);
      });
      try {
        const reply = await Promise.race([answer(JSON.parse(JSON.stringify(request))), late]);
        return JSON.parse(JSON.stringify(reply));
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
