import type { ReactNode, Ref } from "react";

/**
 * `inline` puts the detail after the name ("ACME · WORKSPACE SETTINGS") and moves it onto its own
 * line when the two don't fit; a detail too long even for its own line wraps, and is never cut.
 * `stacked` always puts the name over the detail, for a narrow column.
 */
export type ListHeadingLayout = "inline" | "stacked";

/**
 * A group heading's colour when the group is a state that asks for something: `warning` for
 * "Needs you", `danger` for "Failed", as the Runs app's groups (HAL-18594 rev 3). Without it the
 * heading is `fg-muted`.
 */
export type ListHeadingTone = "warning" | "danger";

/** The props of `ListHeading`. */
export interface ListHeadingProps {
  /** The group's name, written in sentence case: CSS draws the capitals. It may be cut. */
  readonly name: string;
  /** Says which group: "Workspace settings". Never cut. */
  readonly detail?: ReactNode;
  /** Default 2. Use 3 or 4 where the list sits under a panel's own headings. */
  readonly headingLevel?: 2 | 3 | 4;
  /** So a list that isn't a kit List can point `aria-labelledby` at the heading. */
  readonly id?: string;
  readonly layout?: ListHeadingLayout;
  readonly tone?: ListHeadingTone;
  /**
   * For a heading that takes focus from code, as Home's section heading after Try again works
   * (a11y 1.4). With it the heading gets `tabindex="-1"`, so only code can focus it, and the
   * theme draws the focus ring round it, as round every heading that takes focus from code.
   */
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

const shared = "px-4 pt-4 pb-1 text-label uppercase";

const toneClasses: Record<ListHeadingTone | "none", string> = {
  none: "text-fg-muted",
  warning: "text-warning",
  danger: "text-danger",
};

const layoutClasses: Record<ListHeadingLayout, string> = {
  inline: "flex flex-wrap items-baseline gap-x-1",
  stacked: "flex flex-col gap-0.5",
};

/**
 * The heading over a group of rows: a List's `heading`, or a list the kit doesn't draw, such as
 * the shell's Settings nav. A visible "·" is read as a comma: "Acme, Workspace settings".
 *
 * @example
 * <ListHeading name="Acme" detail="Workspace settings" id="settings-acme" layout="stacked" />
 */
export function ListHeading({
  name,
  detail,
  headingLevel = 2,
  id,
  layout = "inline",
  tone,
  headingRef,
}: ListHeadingProps) {
  const Heading = `h${headingLevel}` as const;
  const hasDetail = detail !== undefined && detail !== null && detail !== false && detail !== "";

  return (
    <Heading
      ref={headingRef}
      id={id}
      tabIndex={headingRef === undefined ? undefined : -1}
      className={`${shared} ${toneClasses[tone ?? "none"]} ${layoutClasses[layout]}`}
    >
      <span className="min-w-0 truncate">{name}</span>
      {hasDetail ? (
        <span className="min-w-0 wrap-break-word">
          {layout === "inline" ? <span aria-hidden="true">· </span> : null}
          <span className="sr-only">, </span>
          {detail}
        </span>
      ) : null}
    </Heading>
  );
}
