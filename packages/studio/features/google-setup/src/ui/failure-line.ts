/**
 * An action that failed, as the microcopy's 1.1 shape: "Couldn't save your progress: the engine
 * isn't answering." The reason is the host's message after a colon: no closing full stop, and a
 * capital that only starts its sentence lower-cased. With no message, just "Couldn't *action*."
 */
export function failureLine(action: string, error: unknown): string {
  const message = error instanceof Error ? error.message.trim().replace(/\.$/, "") : "";
  if (message === "") return `Couldn't ${action}.`;
  const reason =
    /^\p{Lu}\p{Ll}/u.test(message) && !/^\S+\p{Lu}/u.test(message)
      ? message.charAt(0).toLowerCase() + message.slice(1)
      : message;
  return `Couldn't ${action}: ${reason}.`;
}
