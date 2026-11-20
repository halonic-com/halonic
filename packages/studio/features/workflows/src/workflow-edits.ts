/**
 * The changes a step's docked card asks of the host (`WorkflowsHost`) for its arrows, and what
 * taking a step or an arrow out hands back. Other features read them through `api.ts`.
 */

/**
 * One change of the arrows out of a step, from its docked card:
 * - `add`: a new arrow to the step `to`, on done, after the step's other arrows;
 * - `move`: the step's arrow at `index` (in file order, from 0) one place up (`-1`) or down (`1`),
 *   which changes which arrow wins when several fit. `to` is where that arrow goes as the card
 *   showed it, so a card that is out of date can't move another arrow;
 * - `set`: one field of the step's arrow at `index`, from its expanded row (see
 *   {@link WorkflowArrowFieldChange}). `to` is where that arrow goes as the card showed it, as for
 *   a move, so a card that is out of date can't change another arrow.
 */
export type WorkflowArrowChange =
  | { readonly kind: "add"; readonly to: string }
  | { readonly kind: "move"; readonly index: number; readonly by: -1 | 1; readonly to: string }
  | ({
      readonly kind: "set";
      readonly index: number;
      readonly to: string;
    } & WorkflowArrowFieldChange);

/**
 * One field of an arrow, as its expanded row edits it. `undefined` takes the field out of the file:
 * the arrow then fires on done, has no timer, no condition or no label. A timer (`after`) replaces
 * the arrow's event, as a wait step's arrow fires either on an event or after a time.
 */
export type WorkflowArrowFieldChange =
  | { readonly field: "to"; readonly value: string }
  | { readonly field: "event" | "after" | "label"; readonly value: string | undefined }
  /** The condition as data (the file's `when`), parsed from the row's JSON. */
  | { readonly field: "condition"; readonly value: unknown };

/** A step or an arrow taken out of a workflow, and the way to put it back (the toast's **Undo**). */
export interface WorkflowRemoval {
  /**
   * Puts it back, while its removal is still the workspace's newest change. After any other change
   * it rejects with `conflict`, saying why, and puts nothing back.
   */
  undo(): Promise<void>;
}

/** A step taken out of a workflow, with the arrows that went with it. */
export interface RemovedStep extends WorkflowRemoval {
  /** How many arrows went: the step's own and those into it from other steps. */
  readonly arrows: number;
}
