// The serve log (`cli.commands.serve.request-log`): one line on stdout per finished request, so a
// pairing try, allowed, refused or over the limit, reaches the log (journald under systemd).
// The server hands over method, path and status only, and leaves out the routes that take a
// secret; no query, header or body ever reaches this port (`RequestLog` in `@halonicjs/host-server`).

import type { RequestLog } from "@halonicjs/host-server";
import type { CommandContext } from "../../command.ts";
import { serveMessages } from "../../messages/serve.ts";
import { printable } from "../../output/printable.ts";

/** A request log that prints each finished request as one line, such as `POST /api/pair 429`. */
export function serveRequestLog(context: Pick<CommandContext, "printAhead">): RequestLog {
  return {
    record: (entry) =>
      // Method and path come from the caller, so a control character can't forge a log line.
      context.printAhead(
        serveMessages.request(printable(entry.method), printable(entry.path), entry.status).phrase,
      ),
  };
}
