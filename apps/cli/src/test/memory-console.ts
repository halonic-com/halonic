import { ConsoleNotRunningError } from "@halonicjs/target-node-runtime";
import type { ConsoleTransport } from "../commands/serve/serve-console.ts";

/**
 * The console channel in memory, by socket path, so a test runs on every system; the Unix
 * socket itself is tested in `@halonicjs/target-node-runtime` (`runtime.console-socket`).
 * Requests and replies go through JSON, as they do on the socket.
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
      return JSON.parse(JSON.stringify(await answer(JSON.parse(JSON.stringify(request)))));
    },
  };
}
