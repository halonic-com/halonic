import { EmptyState, LaptopIcon } from "@halonicjs/studio-kit";

/** The words of `p05c` (Noah's HAL-17514 `wording`, rows "Halonic on the computer too old"). */
export const olderComputerWords = {
  title: (computer: string) => `Update Halonic on ${computer}`,
  text: (computer: string) =>
    `Update Halonic on ${computer} to use Inbox and Messenger from your phone.`,
  hint: "Agents still works.",
} as const;

/**
 * `p05c`: the whole Inbox tab while the computer runs a Halonic that speaks only version 3 of the
 * gateway's messages (`RemoteView.olderComputer`), in p05d's pattern: a laptop on a soft tile, the
 * title centred, the hint small and muted at the foot (Noah, HAL-18949). The Agents tab keeps
 * working without it. Plain page content, not a live region.
 */
export function OlderComputerPanel({ computer }: { readonly computer: string }) {
  return (
    <div className="flex flex-1 flex-col justify-center">
      <EmptyState
        icon={<LaptopIcon />}
        title={olderComputerWords.title(computer)}
        description={
          <>
            <span className="block">{olderComputerWords.text(computer)}</span>
            <span className="mt-4 block text-small">{olderComputerWords.hint}</span>
          </>
        }
      />
    </div>
  );
}
