import type { ReactNode, Ref } from "react";
import type { FormRowsKind } from "./form-rows.tsx";

/**
 * A side-label row. The outer div is the container the row measures, so a Field sizes itself to
 * its own width and nothing reads the window's.
 */
export function SideRow({
  ref,
  look,
  wide,
  label,
  value,
}: {
  ref: Ref<HTMLDivElement>;
  look: SideLook;
  wide: boolean;
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div ref={ref} className="@container">
      <div className={`flex flex-col gap-1 ${look.row}`}>
        {label}
        <div className={wide ? VALUE : `${VALUE} ${look.value}`.trimEnd()}>{value}</div>
      </div>
    </div>
  );
}

/** The value column: the control with its hint or error under it, never under the label. */
const VALUE = "flex min-w-0 flex-1 flex-col gap-1";

/** One side layout's classes: the row, the label column, the label's nudge, the value column. */
export interface SideLook {
  readonly row: string;
  readonly label: string;
  readonly nudge: string;
  readonly value: string;
}

/**
 * The side layout's classes, written out in full so Tailwind finds them. A sheet goes side by
 * side from 46.5rem (168 + 16 + 560px at normal text); a Card's rows from 28rem, so a phone's
 * card still stacks. Under the limit the label is the stacked Field's own.
 */
export const SIDE: Record<FormRowsKind, SideLook> = {
  sheet: {
    row: "@min-[46.5rem]:flex-row @min-[46.5rem]:gap-4",
    label:
      "@min-[46.5rem]:w-42 @min-[46.5rem]:shrink-0 @min-[46.5rem]:text-small @min-[46.5rem]:font-medium",
    nudge: "@min-[46.5rem]:pt-1.5",
    value: "@min-[46.5rem]:max-w-140",
  },
  card: {
    row: "@min-[28rem]:flex-row @min-[28rem]:gap-3",
    label:
      "@min-[28rem]:w-30 @min-[28rem]:shrink-0 @min-[28rem]:text-small @min-[28rem]:font-medium",
    nudge: "@min-[28rem]:pt-1.5",
    value: "",
  },
};

/** The label's classes: hidden, the stacked caption, or the side column's from the query up. */
export function labelClass(
  hideLabel: boolean,
  look: SideLook | undefined,
  align: "control" | "text",
): string {
  if (hideLabel) {
    return "sr-only";
  }
  if (look === undefined) {
    return "text-caption text-fg-muted";
  }
  const nudge = align === "control" ? ` ${look.nudge}` : "";
  return `text-caption text-fg-muted ${look.label}${nudge}`;
}
