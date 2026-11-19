import { Callout } from "../callout/callout.tsx";

/** The props of `TrashStrip`. */
export interface TrashStripProps {
  /** "This file was moved to the trash": one phrase, or a sentence when `detail` follows. */
  readonly text: string;
  /** A second line under the text: "1 agent now shows an error until you take it off its Tools page." */
  readonly detail?: string | undefined;
  /** The button's label: "Undo". */
  readonly undoLabel: string;
  /** Puts the item back; the button is busy while a returned promise runs. */
  readonly onUndo: () => void | Promise<void>;
  /**
   * Undo takes focus when the strip appears, described by the strip's text. For a page whose
   * own controls, where focus was, are gone. Without it the strip takes no focus and the page
   * says it to a screen reader itself.
   */
  readonly focusUndo?: boolean;
}

/**
 * The strip an open item page shows once its item is in the trash (microcopy 2, "Open tab whose
 * item was deleted"): a `warning` Callout with the text, an optional second line and Undo.
 *
 * @example
 * <TrashStrip text="This skill was moved to the trash" undoLabel="Undo" onUndo={undo} focusUndo />
 */
export function TrashStrip({ text, detail, undoLabel, onUndo, focusUndo }: TrashStripProps) {
  return (
    <div className="px-4 pb-2">
      <Callout
        tone="warning"
        action={{ label: undoLabel, onClick: onUndo, focus: focusUndo === true }}
      >
        {text}
        {detail === undefined ? null : (
          <>
            {" "}
            <span className="block">{detail}</span>
          </>
        )}
      </Callout>
    </div>
  );
}
