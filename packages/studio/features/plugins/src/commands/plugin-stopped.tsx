import { inlineLinkClasses } from "@halonicjs/studio-kit";

// A call the host refused with `plugin_stopped` (HAL-15537): the computer passed the sandbox
// check, but the runner's fence didn't hold, so the host stopped it before the plugin ran. The
// host's answer names no plugin, so a card or a command dialog names the plugin it called, and
// links its page, where R15's **Check again** is. Trying again may help, so Try again stays.

/** Whether the host stopped the plugin because its sandbox didn't hold (the host's `plugin_stopped`). */
export function isPluginStopped(error: unknown): boolean {
  return typeof error === "object" && error !== null && "kind" in error
    ? error.kind === "plugin_stopped"
    : false;
}

/** The first sentence: "Halonic stopped Tides: its sandbox didn't hold, so it didn't run." */
export function stoppedLine(name: string): string {
  return `Halonic stopped ${name}: its sandbox didn't hold, so it didn't run.`;
}

/**
 * The second sentence, "Open *Tides* to check again.", with the plugin's name as a link to its
 * page. Without `onOpen`, where the window can't open pages, the name is plain italics.
 */
export function CheckAgainLine({
  name,
  onOpen,
}: {
  /** The plugin's name, which is untrusted text. */
  readonly name: string;
  readonly onOpen?: (() => void) | undefined;
}) {
  const named = (
    <em>
      <bdi>{name}</bdi>
    </em>
  );
  return (
    <>
      Open{" "}
      {onOpen === undefined ? (
        named
      ) : (
        <button type="button" className={inlineLinkClasses} onClick={onOpen}>
          {named}
        </button>
      )}{" "}
      to check again.
    </>
  );
}
