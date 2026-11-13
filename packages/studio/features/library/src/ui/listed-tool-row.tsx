import { Checkbox, StatusChip } from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { ListedToolRow } from "../listed-tools-host.ts";
import { listedToolsWords } from "../listed-tools-words.ts";
import { ListedToolChanges } from "./listed-tool-changes.tsx";
import { PlainList } from "./plain-list.tsx";

/** Props for {@link ListedToolRowView}. */
export interface ListedToolRowViewProps {
  readonly row: ListedToolRow;
  /** The connector's name, for the plate that says its server connects differently. */
  readonly sourceName: string;
  /** `null` for a tool that keeps changing: it has no tick box, only its own button. */
  readonly tick: { readonly ticked: boolean; readonly onToggle: () => void } | null;
  /** Shows the state chip. The first screen leaves it out, since every row would say "Not approved". */
  readonly showState: boolean;
  /** A button of the row's own, at the right of the name: "Approve this version". */
  readonly action?: ReactNode;
}

/** Whether the three-line clamp hides part of `element`: the only honest test, since lines break by width. */
function isClamped(element: HTMLElement | null): boolean {
  return element !== null && element.scrollHeight > element.clientHeight;
}

/**
 * One tool to decide on: the tick box, the name in the code font, the description folded after
 * three lines, the arguments and the "Asks you before each use." line. Everything the server
 * wrote is plain text: React escapes it, and none of it picks a colour, icon or button word.
 */
export function ListedToolRowView({
  row,
  sourceName,
  tick,
  showState,
  action,
}: ListedToolRowViewProps) {
  const descriptionId = useId();
  const [unfolded, setUnfolded] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);
  // Measured, not guessed from the length: a narrow dialog or a large font clamps short text too.
  // Once unfolded the clamp is gone and nothing overflows, so the button stays on its last answer.
  useEffect(() => {
    if (unfolded) return;
    const measure = () => setClamped(isClamped(descriptionRef.current));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [unfolded, row.description]);
  const foldable = clamped || unfolded;
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
            {action}
          </div>
          <p
            id={descriptionId}
            ref={descriptionRef}
            className={`whitespace-pre-line text-body text-fg [overflow-wrap:anywhere] ${!unfolded ? "line-clamp-3" : ""}`}
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
              {unfolded ? listedToolsWords.showLess : listedToolsWords.showAll}
            </button>
          ) : null}
          <ListedToolChanges
            differences={row.differences}
            serverChanged={row.serverChanged}
            sourceName={sourceName}
          />
          {row.arguments.length === 0 ? null : (
            <div className="text-small text-fg-muted">
              <span>{listedToolsWords.argumentsLabel}</span>
              <PlainList>
                {row.arguments.map((argument, index) => (
                  <li key={`${index}:${argument.name}`} className="[overflow-wrap:anywhere]">
                    <span className="font-mono">{argument.name}</span>
                    {argument.type === undefined ? "" : ` (${argument.type})`}
                    {argument.description === undefined ? "" : `: ${argument.description}`}
                  </li>
                ))}
              </PlainList>
            </div>
          )}
          {row.leftOutArguments.map((reason, index) => (
            <p key={`${index}:${reason}`} className="text-small text-fg-muted">
              {listedToolsWords.leftOut(reason)}
            </p>
          ))}
          <p className="text-small text-fg-muted">{listedToolsWords.askedBeforeEachUse}</p>
        </div>
      </div>
    </li>
  );
}
