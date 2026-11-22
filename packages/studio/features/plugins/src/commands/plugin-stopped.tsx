import { inlineLinkClasses } from "@halonicjs/studio-kit";
import { stoppedAtStart } from "../page/page-text.ts";

// A call the host refused with `plugin_stopped` (HAL-15537): the computer passed the sandbox
// check, but the runner's fence didn't hold, so the host stopped it before the plugin ran. The
// host's answer names no plugin, so a card or a command dialog names the plugin it called, in the
// page's words (R15). Try again starts the plugin in the sandbox again, so the line points there;
// the page's **Check again** only forgets the stop, so the name links the page for details only
// (flow check C630 #4, HAL-15788).

/** Whether the host stopped the plugin because the sandbox didn't work (the host's `plugin_stopped`). */
export function isPluginStopped(error: unknown): boolean {
  return typeof error === "object" && error !== null && "kind" in error
    ? error.kind === "plugin_stopped"
    : false;
}

/**
 * The first sentence as text, the page's: "Halonic stopped Tides: the sandbox didn't work when it
 * started, so none of it ran." For the dialog's alert, which takes only text; a card uses
 * {@link StoppedLine}.
 */
export function stoppedLine(name: string): string {
  return stoppedAtStart(name);
}

/** The first sentence with the plugin's name in `<bdi>`, as {@link TryAgainLine} has it. */
export function StoppedLine({
  name,
}: {
  /** The plugin's name, which is untrusted text. */
  readonly name: string;
}) {
  return (
    <>
      Halonic stopped <bdi>{name}</bdi>: the sandbox didn't work when it started, so none of it ran.
    </>
  );
}

/**
 * The second line, "Try again starts it in the sandbox again. Open *Tides* for details.", with the
 * plugin's name as a link to its page. Without `onOpen`, where the window can't open pages, the
 * name is plain italics.
 */
export function TryAgainLine({
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
      Try again starts it in the sandbox again. Open{" "}
      {onOpen === undefined ? (
        named
      ) : (
        <button type="button" className={inlineLinkClasses} onClick={onOpen}>
          {named}
        </button>
      )}{" "}
      for details.
    </>
  );
}
