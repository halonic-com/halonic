import type { CalloutAction } from "../callout/callout.tsx";
import type { DialogProps } from "./dialog-props.ts";

/**
 * The failure Callout's one action: the Dialog's own `errorAction`, else **Try again** when the
 * Dialog was given a `retryLabel`.
 */
export function retryAction(
  props: Pick<DialogProps, "errorAction" | "retryLabel">,
  send: () => void,
): CalloutAction | undefined {
  if (props.errorAction !== undefined) return props.errorAction;
  return props.retryLabel === undefined ? undefined : { label: props.retryLabel, onClick: send };
}
