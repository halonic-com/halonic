// The line `halonic serve` prints when the server refuses a webhook delivery
// with a 400 or fails it with a 500 (HAL-15084). The sender gets the reason in
// the answer, but the person at the terminal saw nothing, so a webhook that
// never started looked like one that was never sent. A 401 (an unsigned or
// wrongly signed request) stays silent: anyone on the network can send one.

import { type Server, type ServerErrorBody, webhookPathPrefix } from "@halonicjs/host-server";
import type { Phrase } from "../../messages/phrase.ts";
import { serveMessages } from "../../messages/serve.ts";
import { printable } from "../../output/printable.ts";

/** What {@link reportWebhookRefusals} needs besides the server. */
export interface WebhookRefusalReport {
  /** The name of the routine at `key` (`<hub>/<routine>`), or `null` when there is none. */
  readonly routineName: (key: string) => Promise<string | null>;
  /** Prints one line ahead of the prompt. */
  readonly print: (line: Phrase) => void;
  /** Whether serve was started with `--debug`, so a 500's cause is printed already. */
  readonly debugging: boolean;
}

/**
 * `server`, with a line printed for each webhook delivery it answers with a
 * 400 (the server's reason) or a 500 (a bug: F16's two lines, with the
 * cause under `--debug`).
 *
 * @example
 * reportWebhookRefusals(server, { routineName, print, debugging: false });
 * // "✕ Weekly report didn't start on a web request: {{trigger.date}} isn't a trigger value. …"
 */
export function reportWebhookRefusals(server: Server, report: WebhookRefusalReport): Server {
  return {
    async handle(request, context) {
      const response = await server.handle(request, context);
      if (response.status !== 400 && response.status !== 500) return response;
      const path = new URL(request.url).pathname;
      if (!path.startsWith(webhookPathPrefix)) return response;
      const key = path.slice(webhookPathPrefix.length);
      // A lookup that throws names the address instead: the line never stops the answer.
      const found = await report.routineName(key).catch(() => null);
      const name = printable(found ?? key);
      if (response.status === 500) {
        report.print(serveMessages.webhookFailed(name).phrase);
        report.print(serveMessages.webhookFailedFix(report.debugging).phrase);
        return response;
      }
      const body = (await response.clone().json()) as ServerErrorBody;
      report.print(serveMessages.webhookRefused(name, printable(body.message)).phrase);
      return response;
    },
  };
}
