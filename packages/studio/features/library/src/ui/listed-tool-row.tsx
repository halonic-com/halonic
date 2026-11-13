import { Checkbox, StatusChip } from "@halonicjs/studio-kit";
import { useId, useState } from "react";
import type { ListedToolRow } from "../listed-tools-host.ts";
import { listedToolsWords } from "../listed-tools-words.ts";
import { PlainList } from "./plain-list.tsx";

/** Props for {@link ListedToolRowView}. */
export interface ListedToolRowViewProps {
  readonly row: ListedToolRow;
  /** `null` for a tool that keeps changing: it has no tick box, only its own button. */
  readonly tick: { readonly ticked: boolean; readonly onToggle: () => void } | null;
  /** Shows the state chip. The first screen leaves it out, since every row would say "Not approved". */
  readonly showState: boolean;
}

/** A description longer than this gets **Show all**: three lines of the dialog hold about this much. */
const foldAfterCharacters = 180;

/**
 * One tool to decide on: the tick box, the name in the code font, the description folded after
 * three lines, the arguments and the "Asks you before each use." line. Everything the server
 * wrote is plain text: React escapes it, and none of it picks a colour, icon or button word.
 */
export function ListedToolRowView({ row, tick, showState }: ListedToolRowViewProps) {
  const descriptionId = useId();
  const [unfolded, setUnfolded] = useState(false);
  const foldable =
    row.description.length > foldAfterCharacters || row.description.split("\n").length > 3;
  return (
    <li className="flex min-w-0 flex-col gap-1 border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 items-start gap-3">
        {tick === null ? null : (
          <Checkbox
            label={listedToolsWords.tickLabel(row.name)}
            checked={tick.ticked}
            onChange={tick.onToggle}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-body-strong [overflow-wrap:anywhere]">{row.name}</span>
            {showState ? (
              <StatusChip tone="neutral">
                {listedToolsWords.states[row.state === "changed" ? "changed" : "notApproved"]}
              </StatusChip>
            ) : null}
          </div>
          <p
            id={descriptionId}
            className={`whitespace-pre-line text-body text-fg [overflow-wrap:anywhere] ${foldable && !unfolded ? "line-clamp-3" : ""}`}
          >
            {row.description}
          </p>
          {foldable ? (
            <button
              type="button"
              aria-expanded={unfolded}
              aria-controls={descriptionId}
              className="self-start text-small text-primary focus-ring"
              onClick={() => setUnfolded(!unfolded)}
            >
              {listedToolsWords.showAll}
            </button>
          ) : null}
          {row.arguments.length === 0 ? null : (
            <div className="text-small text-fg-muted">
              <span>{listedToolsWords.argumentsLabel}</span>
              <PlainList>
                {row.arguments.map((argument) => (
                  <li key={argument.name} className="[overflow-wrap:anywhere]">
                    <span className="font-mono">{argument.name}</span>
                    {argument.type === undefined ? "" : ` (${argument.type})`}
                    {argument.description === undefined ? "" : `: ${argument.description}`}
                  </li>
                ))}
              </PlainList>
            </div>
          )}
          {row.leftOutArguments.map((reason) => (
            <p key={reason} className="text-small text-fg-muted">
              {listedToolsWords.leftOut(reason)}
            </p>
          ))}
          <p className="text-small text-fg-muted">{listedToolsWords.askedBeforeEachUse}</p>
        </div>
      </div>
    </li>
  );
}
