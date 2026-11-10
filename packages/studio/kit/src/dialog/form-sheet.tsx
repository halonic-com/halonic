import { type FormEvent, useId, useState } from "react";
import { ActionBar } from "../action-bar/action-bar.tsx";
import { InFormSheetContext } from "../sheet/in-form-sheet.ts";
import { SheetFrame } from "../sheet/sheet-frame.tsx";
import { AlertSlot } from "./alert-slot.tsx";
import type { DialogProps } from "./dialog-props.ts";

/**
 * A `form` Dialog on a phone (component specs 8 and 15.3): a full-screen sheet with Close at the
 * top left, the fields padded 12px 16px and 16px apart in a body that scrolls, and the confirming
 * button full width at the bottom in an ActionBar that rides on the keyboard. Still a `<dialog>`
 * with `showModal()`, so focus, inertness and the toast rule don't change. Close cancels and asks
 * nothing; a failed submit's Callout is the last thing in the body, above the bar.
 */
export function FormSheet(props: DialogProps) {
  const { busy = false } = props;
  const confirmId = useId();
  const [attempt, setAttempt] = useState(0);

  function cancel() {
    if (!busy) {
      props.onCancel();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || props.confirm.unavailable !== undefined) {
      return;
    }
    setAttempt((previous) => previous + 1);
    props.onConfirm();
  }

  return (
    <SheetFrame
      title={props.title}
      onClose={cancel}
      closeUnavailable={busy ? { reason: confirmId } : undefined}
      onCancel={cancel}
      onClosedByBrowser={props.onCancel}
      onSubmit={submit}
      footer={
        <ActionBar
          rows={[
            [
              {
                id: confirmId,
                label: props.confirm.label,
                variant: "primary",
                type: "submit",
                busy,
                busyLabel: props.confirm.busyLabel,
                unavailable: props.confirm.unavailable,
              },
            ],
          ]}
        />
      }
      {...(props.returnFocus === undefined ? {} : { returnFocus: props.returnFocus })}
    >
      <InFormSheetContext value={true}>
        <div className="flex flex-col gap-4 px-4 py-3">{props.children}</div>
        <div className="px-4 pb-3">
          <AlertSlot error={props.error} attempt={attempt} waiting={busy} />
        </div>
      </InFormSheetContext>
    </SheetFrame>
  );
}
