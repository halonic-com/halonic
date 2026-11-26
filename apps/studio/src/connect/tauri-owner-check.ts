import type { OwnerCheckAvailable, OwnerCheckReady } from "@halonicjs/studio-feature-remote/phone";
import type { TauriIpc } from "@halonicjs/studio-services/tauri-ipc";

const NOT_READY: OwnerCheckReady = { approval: false, answer: false };

/**
 * The shell's `owner_check_available` (HAL-15194, per decision since HAL-19060):
 * whether the phone's owner check can ask right now, for an answer to an
 * approval and for an Inbox answer. It takes nothing from the page. Anything but
 * a plain `true` reads as no for that kind, and a refusal as no for both, so
 * `risky` approvals stay on the computer; a refusal also goes to the log.
 */
export function tauriOwnerCheckAvailable(
  internals: TauriIpc,
  report: (line: string) => void,
): OwnerCheckAvailable {
  return () =>
    internals.invoke("owner_check_available").then(readyOf, (error: unknown) => {
      report(`owner_check_available was refused: ${String(error)}`);
      return NOT_READY;
    });
}

function readyOf(answer: unknown): OwnerCheckReady {
  if (typeof answer !== "object" || answer === null) return NOT_READY;
  const { approval, answer: inboxAnswer } = answer as Record<string, unknown>;
  return { approval: approval === true, answer: inboxAnswer === true };
}
