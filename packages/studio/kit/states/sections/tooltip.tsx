import { TooltipBody, tooltipClasses } from "../../src/tooltip/tooltip.tsx";
import type { PartSection } from "../state-table.tsx";

/** A static copy of a shown Tooltip: the real fill and text, drawn inline, not in the top layer. */
function StaticTooltip({
  text,
  keys,
}: {
  readonly text: string;
  readonly keys?: readonly string[];
}) {
  return (
    <div role="tooltip" className={tooltipClasses}>
      <TooltipBody text={text} keys={keys} />
    </div>
  );
}

export const tooltipSection: PartSection = {
  id: "tooltip",
  number: "14",
  name: "Tooltip",
  order: "kit 14 · a shown tooltip, drawn inline; left to right: short, long",
  notApplicable:
    "hover, focus, disabled (it never takes the pointer; its control has them). Never on touch",
  rows: [
    {
      name: "Plain",
      copies: () => (
        <>
          <StaticTooltip text="New tab" />
          <StaticTooltip text="Finish getting updates first, then run the workflow again." />
        </>
      ),
    },
    {
      name: "With keys",
      copies: () => (
        <>
          <StaticTooltip text="New tab" keys={["Ctrl", "T"]} />
          <StaticTooltip text="Reopen closed tab" keys={["Ctrl", "Shift", "T"]} />
        </>
      ),
    },
  ],
};
