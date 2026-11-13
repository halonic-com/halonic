import { type RoutineTrigger, WEBHOOK_REFUSED_HEADERS } from "@halonicjs/format";
import type { TriggerFacts } from "./routine-start.ts";

/** A body longer than this stays text: nothing is parsed from a body this size. */
const MAX_JSON_BODY_CHARS = 256 * 1024;

/** A verified webhook request, as the host hands it over. */
export interface WebhookRequest {
  /** When the request arrived. */
  at: Date;
  /** The request body as text. */
  body: string;
  /** Every request header by lowercase name; only the ones the routine asked for get through. */
  headers: Readonly<Record<string, string>>;
}

/**
 * What a webhook request tells the routine, for `{{trigger.body}}` and
 * `{{trigger.headers.<name>}}`.
 *
 * - **Body:** the parsed value when the request says it is JSON
 *   (`content-type` is `application/json` or ends in `+json`) and the body
 *   parses; otherwise the body text. A JSON value is data: the run reads it
 *   as it reads a mail message and never as a template.
 * - **Headers:** only those the routine lists in `trigger.webhook.headers`,
 *   and never one of `WEBHOOK_REFUSED_HEADERS`. The rest, `authorization` and
 *   `cookie` included, never reach the run.
 *
 * A routine that isn't triggered by a webhook gets no headers.
 *
 * @example
 * webhookFacts(trigger, { at, body: '{"n":1}', headers: { "content-type": "application/json" } });
 * // { at, lastRun: null, body: { n: 1 }, headers: {} }
 */
export function webhookFacts(
  trigger: RoutineTrigger,
  request: WebhookRequest,
  lastRun: Date | null = null,
): TriggerFacts {
  const asked = "webhook" in trigger ? trigger.webhook.headers : [];
  const headers = Object.fromEntries(
    asked.flatMap((name) => {
      // The file check refuses these too; a trigger built without it must not copy them either.
      if (WEBHOOK_REFUSED_HEADERS.includes(name)) {
        return [];
      }
      // Own properties only, so "constructor" never reads Object.prototype.
      const value = Object.hasOwn(request.headers, name) ? request.headers[name] : undefined;
      return value === undefined ? [] : [[name, value] as const];
    }),
  );
  return { at: request.at, lastRun, body: bodyValue(request), headers };
}

function bodyValue({ body, headers }: WebhookRequest): unknown {
  const type = (headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (
    (type !== "application/json" && !type.endsWith("+json")) ||
    body.length > MAX_JSON_BODY_CHARS
  ) {
    return body;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}
