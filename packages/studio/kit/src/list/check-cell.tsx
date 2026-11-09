import { Checkbox } from "../checkbox/checkbox.tsx";
import type { GridNavigation } from "../grid-navigation/use-grid-navigation.ts";
import type { ListRow, ListSelection } from "./list-props.ts";

/**
 * The checkbox cell's width: 16px inset, the 16px box and the gap to what follows, 12px on
 * desktop and 16px on a phone or a touch screen, where the whole 48px is the tap target.
 */
const widthClasses = "w-11 pl-4 touch:w-touch phone:w-touch";

interface CheckCellProps<Id extends string> {
  readonly row: ListRow<Id>;
  readonly selection: ListSelection<Id>;
  readonly isSelected: boolean;
  /** The id of an unavailable row's reason, which the box points at. */
  readonly reasonId: string;
  readonly grid: GridNavigation;
  /** The row's fill, line, corners and selected bar. */
  readonly className: string;
}

/**
 * The first cell of a row in a list that both opens and selects rows (C21): a click anywhere in
 * it selects without opening and puts focus on the box, and its box is a cell of the grid, so ← →
 * reach it and Space on it toggles. The box mirrors the row's `aria-selected`.
 */
export function CheckCell<Id extends string>({
  row,
  selection,
  isSelected,
  reasonId,
  grid,
  className,
}: CheckCellProps<Id>) {
  const isUnavailable = row.unavailable !== undefined;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the box inside takes the keys; the cell only widens its target
    // biome-ignore lint/a11y/useFocusableInteractive: the box inside is the cell's focusable element, as the More button is
    <td
      // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a cell of the grid above
      role="gridcell"
      className={`group/checkbox p-0 ${widthClasses} ${isUnavailable ? "cursor-not-allowed" : "cursor-pointer"} ${className}`}
      onClick={(event) => {
        // The box and the touch target round it report their own clicks through onChange.
        if (event.target instanceof Element && event.target.closest("input, label") !== null) {
          return;
        }
        // Focus goes where the click was, as on the box itself, also when it does nothing else.
        event.currentTarget.querySelector("input")?.focus();
        if (!isUnavailable) {
          selection.onToggle(row.id);
        }
      }}
    >
      <Checkbox
        label={`${selection.verb ?? "Select"} ${row.title}`}
        checked={isSelected}
        onChange={() => selection.onToggle(row.id)}
        unavailable={isUnavailable ? { reason: reasonId } : undefined}
        {...grid.cell(row.id, 0)}
      />
    </td>
  );
}
