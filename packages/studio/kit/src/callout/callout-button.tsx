import { useState } from "react";
import { Button, OnTintContext } from "../button/button.tsx";
import { Tooltip, type TooltipTriggerProps } from "../tooltip/tooltip.tsx";
import type { CalloutAction } from "./callout.tsx";

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
  /** The ids of the Callout's title and text, which a focused action is described by. */
  readonly describedBy: string | undefined;
}) {
  const focused = action.focus === true;
  const [busy, setBusy] = useState(false);

  function run() {
    const result = action.onClick();
    if (result === undefined) {
      return;
    }
    setBusy(true);
    // A rejection is the screen's to report; `finally` passes it on rather than hide it.
    return result.finally(() => setBusy(false));
  }

  const button = (trigger: TooltipTriggerProps) => (
    <Button
      variant="ghost"
      size="sm"
      busy={busy}
      busyLabel={action.busyLabel}
      onClick={run}
      {...(focused ? { ref: focusOnMount } : {})}
      {...(focused && describedBy !== undefined ? { "aria-describedby": describedBy } : {})}
      {...trigger}
    >
      {action.label}
      {action.opens === undefined ? null : (
        <>
          <span aria-hidden="true"> ↗</span>
          <span className="sr-only">. {action.opens}</span>
        </>
      )}
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
