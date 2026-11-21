// The lines `halonic serve` prints for the routines a web request starts
// (HAL-14299): one per webhook routine that is on, with the address it
// listens at, and a ✕ line when its secret isn't set or names a secret that
// belongs to Halonic or a plugin, or when the routine has a trigger value
// `halonic validate` reports (HAL-15084), since the server then refuses every
// request for it. Without them, nothing said why a webhook routine never
// started.

import { webhookPathPrefix } from "@halonicjs/host-server";
import { type Secrets, workspaceSecrets } from "@halonicjs/ports";
import { type PlacedRoutine, routineKey, triggerValueProblems } from "@halonicjs/routines";
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
    const state = await secretState(secrets, secret);
    if (state === "unset") {
      lines.push(serveMessages.webhookSecretNotSet(name, printable(secret)).phrase);
    } else if (state === "reserved") {
      lines.push(serveMessages.webhookSecretNotOwn(name, printable(secret)).phrase);
    }
    // The first one only, as a start stops at it (`routineStart`).
    const problem = triggerValueProblems(routine)[0];
    if (problem !== undefined) {
      lines.push(serveMessages.webhookRoutineInvalid(name, printable(problem.message)).phrase);
    }
  }
  return lines;
}

/**
 * How the server sees the routine's secret: set when it has a value to
 * check requests with, unset when it has none or an empty one, and
 * reserved when the name belongs to Halonic or a plugin, such as
 * `serve-password`. The server never accepts such a name for a webhook, so
 * setting it wouldn't help, and would overwrite Halonic's own secret.
 */
async function secretState(secrets: Secrets, name: string): Promise<"set" | "unset" | "reserved"> {
  try {
    const value = await workspaceSecrets(secrets).get(name);
    return value !== null && value !== "" ? "set" : "unset";
  } catch (error) {
    if (error instanceof RangeError) return "reserved";
    throw error;
  }
}
