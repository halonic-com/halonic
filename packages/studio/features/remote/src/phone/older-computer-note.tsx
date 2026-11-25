import { useId } from "react";

/** The words of `p05c` (Noah's HAL-17514 `wording`, rows "Halonic on the computer too old"). */
export const olderComputerWords = {
  title: (computer: string) => `Update Halonic on ${computer}`,
  text: (computer: string) =>
    `Update Halonic on ${computer} to use Inbox and Messenger from your phone.`,
  hint: "Agents still works.",
} as const;

/**
 * `p05c`: over the agents while the computer runs a Halonic that speaks only version 3 of the
 * gateway's messages (`RemoteView.olderComputer`). The phone fell back to it, so it offers Agents
 * only; the note says what an update there would add. Plain page content, not a live region.
 */
export function OlderComputerNote({ computer }: { readonly computer: string }) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-1 rounded-md border border-border px-4 py-3"
    >
      <p id={titleId} className="text-body-strong text-fg">
        {olderComputerWords.title(computer)}
      </p>
      <p className="text-small text-fg">{olderComputerWords.text(computer)}</p>
      <p className="text-small text-fg-muted">{olderComputerWords.hint}</p>
    </section>
  );
}
