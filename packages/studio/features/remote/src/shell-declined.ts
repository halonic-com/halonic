/**
 * Whether the person said no in the desktop shell's own window before a remote save was sent
 * (its `declined`, `studio.src-tauri.remote-saves-ask`). Nothing was sent and nothing went wrong,
 * so the setting stays as it was with no error line, as the plugins' trust check does (HAL-17880).
 *
 * @example
 * shellDeclined({ kind: "declined", message: "Cancelled." }); // true
 * shellDeclined(new Error("the host didn't answer")); // false
 */
export function shellDeclined(error: unknown): boolean {
  return typeof error === "object" && error !== null && "kind" in error
    ? error.kind === "declined"
    : false;
}
