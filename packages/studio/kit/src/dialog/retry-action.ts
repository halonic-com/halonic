import type { CalloutAction } from "../callout/callout.tsx";

/** The failure Callout's **Try again**, when the Dialog was given a `retryLabel`. */
export function retryAction(
  label: string | undefined,
  send: () => void,
): CalloutAction | undefined {
  return label === undefined ? undefined : { label, onClick: send };
}
