import { useState } from "react";
import { Button, OnTintContext } from "../button/button.tsx";
import { Tooltip, type TooltipTriggerProps } from "../tooltip/tooltip.tsx";
import type { CalloutAction } from "./callout.tsx";
import { useDoneLabel } from "./done-label.ts";

/**
 * A label too long for the Callout wraps between words like every kit button's (HAL-14010), so
 * at 200 % on a phone it isn't cut (WCAG 1.4.10, HAL-13770). On a phone its lines start at the
 * left, in line with the text above, so the ↗ stays next to the last word (C399). These 6px and
 * the button's own 2px keep a wrapped first line 8px off the border (C275 PX4); one line with
 * them is 38px with the border, under the phone's 40px minimum, so it doesn't change.
 */
const labelClasses = "phone:text-start phone:py-1.5";

/** Puts focus on an action that asks for it when it is drawn. */
function focusOnMount(button: HTMLButtonElement | null): void {
  button?.focus();
}

/** The ghost action, busy while a returned promise runs, so it keeps focus (17.5). */
export function CalloutButton({
  action,
  describedBy,
}: {
  readonly action: CalloutAction;
  /** The ids of the Callout's title and text the action is described by; `undefined` for none. */
  readonly describedBy: string | undefined;
}) {
  const focused = action.focus === true;
  const [busy, setBusy] = useState(false);
  const done = useDoneLabel(action.label, action.doneLabel);

  function run() {
    const result = action.onClick();
    if (result === undefined) {
      return;
    }
    setBusy(true);
    // A rejection is the screen's to report; `finally` passes it on rather than hide it.
    return result
      .then((outcome) => {
        if (outcome === false) return;
        done.show();
      })
      .finally(() => setBusy(false));
  }

  const button = (trigger: TooltipTriggerProps) => (
    <Button
      variant="ghost"
      size="sm"
      busy={busy}
      busyLabel={action.busyLabel}
      onClick={run}
      {...(focused ? { ref: focusOnMount } : {})}
      {...(describedBy === undefined ? {} : { "aria-describedby": describedBy })}
      {...trigger}
    >
      <span className={labelClasses}>
        {done.label}
        {action.opens === undefined ? null : (
          <>
            <span aria-hidden="true"> ↗</span>
            <span className="sr-only">. {action.opens}</span>
          </>
        )}
      </span>
    </Button>
  );

  return (
    <OnTintContext value={true}>
      {action.opens === undefined ? (
        button({})
      ) : (
        <Tooltip text={action.opens} isName>
          {button}
        </Tooltip>
      )}
    </OnTintContext>
  );
}
