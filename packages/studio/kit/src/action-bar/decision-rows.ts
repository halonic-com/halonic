import type { ActionBarButton, ActionBarRow } from "./action-bar.tsx";

/** One event a wait step offers: "Approve", "Ask for changes", "Reject". The rule picks its look. */
export type DecisionEvent = Omit<ActionBarButton, "variant">;

/**
 * The decision bar's rows for a wait step's events, in file order (component specs 20.6): the
 * first is `primary` on its own row; the others are `secondary`, one on its own row, two side by
 * side, three or more stacked. Nothing is red: rejecting is a decision, not a destructive action.
 * Without events there are no rows; then the screen shows no bar.
 *
 * @example
 * <ActionBar rows={decisionRows([approve, askForChanges, reject])} />
 */
export function decisionRows(events: readonly DecisionEvent[]): readonly ActionBarRow[] {
  const [first, ...others] = events;
  if (first === undefined) {
    return [];
  }
  const primary: ActionBarRow = [{ ...first, variant: "primary" }];
  const secondary = others.map((event): ActionBarButton => ({ ...event, variant: "secondary" }));
  const [left, right] = secondary;
  if (secondary.length === 2 && left !== undefined && right !== undefined) {
    return [primary, [left, right]];
  }
  return [primary, ...secondary.map((button): ActionBarRow => [button])];
}
