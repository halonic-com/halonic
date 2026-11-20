// The lines `halonic serve` prints for the routines a web request starts
// (HAL-14299): one per webhook routine that is on, with the address it
// listens at, and a ✕ line when its secret isn't set, since the server then
// refuses every request for it. Without them, nothing said why a webhook
// routine never started.

import { webhookPathPrefix } from "@halonicjs/host-server";
import { type Secrets, workspaceSecrets } from "@halonicjs/ports";
import { type PlacedRoutine, routineKey } from "@halonicjs/routines";
import type { Phrase } from "../../messages/phrase.ts";
import { serveMessages } from "../../messages/serve.ts";
import { printable } from "../../output/printable.ts";

/**
 * The lines for the webhook routines among `routines`, in their order.
 *
 * @param address - where the server listens, such as `http://localhost:4747`
 *
 * @example
 * await webhookRoutineLines(routines, secrets, "http://localhost:4747");
 * // "Friday digest starts on a web request at http://localhost:4747/api/webhooks/notes/friday-digest"
 * // "✕ Friday digest won't start: its secret friday-hook isn't set. Set it with: halonic secret set friday-hook"
 */
export async function webhookRoutineLines(
  routines: readonly PlacedRoutine[],
  secrets: Secrets,
  address: string,
): Promise<Phrase[]> {
  const lines: Phrase[] = [];
  for (const placed of routines) {
    const { routine } = placed;
    if (!routine.enabled || !("webhook" in routine.trigger)) continue;
    const name = printable(routine.name);
    const url = `${address}${webhookPathPrefix}${routineKey(placed)}`;
    lines.push(serveMessages.webhookRoutine(name, printable(url)).phrase);
    const secret = routine.trigger.webhook.secret;
    if (!(await secretIsSet(secrets, secret))) {
      lines.push(serveMessages.webhookSecretNotSet(name, printable(secret)).phrase);
    }
  }
  return lines;
}

/**
 * Whether the routine's secret has a value the server can sign with: as
 * the server reads it, an empty value or a name a workspace may not pick is
 * no secret.
 */
async function secretIsSet(secrets: Secrets, name: string): Promise<boolean> {
  try {
    const value = await workspaceSecrets(secrets).get(name);
    return value !== null && value !== "";
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}
