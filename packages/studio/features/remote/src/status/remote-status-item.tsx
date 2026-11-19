import { Button } from "@halonicjs/studio-kit";
import type { StatusBarItemProps } from "@halonicjs/studio-shell";
import { RemoteControlService } from "../api.ts";
import { useRemoteState } from "../remote-state.ts";
import { type StatusDot, statusWords } from "./status-words.ts";

/** The look of each dot; `none` draws none. */
const dots: Readonly<Record<Exclude<StatusDot, "none">, string>> = {
  ring: "border border-fg-muted",
  connected: "bg-success",
  attention: "bg-attention",
};

/**
 * The status bar's Remote item (`remote.status-item`): this computer's remote state in a few
 * words, such as "Pixel 8 connected". State only: it never pops anything up, and isn't a live
 * region. A press opens Settings › Remote, which says why when it needs attention. Like the
 * section, it shows only while the host offers remote.
 */
export function RemoteStatusItem({ context }: StatusBarItemProps) {
  const state = useRemoteState(context.services.find(RemoteControlService));
  const words = state && statusWords(state);
  if (words === undefined) return null;
  return (
    <Button variant="ghost" size="sm" onClick={() => context.openSettings?.("remote")}>
      <span aria-hidden="true" className="flex items-center gap-1.5 whitespace-nowrap">
        {words.dot !== "none" && (
          <span
            data-dot={words.dot}
            className={`size-2 shrink-0 rounded-full ${dots[words.dot]}`}
          />
        )}
        {words.text}
      </span>
      <span className="sr-only">{spokenOf(words.text)}</span>
    </Button>
  );
}

/** What a screen reader says: the middle dot reads as a comma (microcopy 19.6). */
function spokenOf(text: string): string {
  return text.replaceAll(" · ", ", ");
}
