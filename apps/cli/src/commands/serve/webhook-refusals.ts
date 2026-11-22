// The line `halonic serve` prints when the server refuses a webhook delivery
// with a 400 or fails it with a 500 (HAL-15084). The sender gets the reason in
// the answer, but the person at the terminal saw nothing, so a webhook that
// never started looked like one that was never sent. A 501 (the routine
// starts an agent) gets the same line, and a delivery that started a run, or
// skipped one, gets its own line too (C570). A 401 (an unsigned or wrongly
// signed request) stays silent: anyone on the network can send one.

import { shortRunId } from "@halonicjs/app";
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
 * 202 (the run it started, or that it skipped one), a 400 or 501 (the
 * server's reason) or a 500 (a bug: F16's two lines, with the cause under
 * `--debug`).
 *
 * @example
 * reportWebhookRefusals(server, { routineName, print, debugging: false });
 * // "✓ Weekly report started on a web request · run 01jd8q"
 * // "✕ Weekly report didn't start on a web request: {{trigger.date}} isn't a trigger value. …"
 */
export function reportWebhookRefusals(server: Server, report: WebhookRefusalReport): Server {
  return {
    async handle(request, context) {
      const response = await server.handle(request, context);
      if (!reported.has(response.status)) return response;
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
      report.print(await deliveryLine(name, response));
      return response;
    },
  };
}

/** The answers to a signed delivery that get a line; a 401 stays silent. */
const reported = new Set([202, 400, 500, 501]);

/** The line for a delivery the server answered with a 202, a 400 or a 501. */
async function deliveryLine(name: string, response: Response): Promise<Phrase> {
  if (response.status === 202) {
    const body = (await response.clone().json()) as { runId?: string };
    return body.runId === undefined
      ? serveMessages.webhookSkipped(name).phrase
      : serveMessages.webhookStarted(name, shortRunId(body.runId)).phrase;
  }
  const body = (await response.clone().json()) as ServerErrorBody;
  return serveMessages.webhookRefused(name, printable(body.message)).phrase;
}
