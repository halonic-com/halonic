// A tool call the host can't run at all (UX check L11, rules N6 and P5): this build of Halonic has
// no plugin tools, or this computer can't fence them. Trying again can't change either, so a card
// or a command dialog says it on its own, without "Couldn't…:" in front and without Try again.

/**
 * The line for a call the host refused for good, or `undefined` for a failure that trying again
 * may fix. The host's error carries its `kind` (`AgentHostPluginToolCaller`): `not_in_this_build`
 * gets `notInThisBuild`, the card's or the dialog's own sentence; `not_fenced` keeps the host's
 * line ("Plugin tools can't run on this computer yet: …").
 *
 * @example
 * cantRunLine(error, notInThisBuildLine("Tides")) // "Plugin tools aren't in this build of Halonic yet, so Tides can't show anything."
 */
export function cantRunLine(error: unknown, notInThisBuild: string): string | undefined {
  if (typeof error !== "object" || error === null || !("kind" in error)) return undefined;
  if (error.kind === "not_in_this_build") return notInThisBuild;
  if (error.kind !== "not_fenced") return undefined;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return message.trim() === "" ? undefined : message.trim();
}
