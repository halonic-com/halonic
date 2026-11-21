import { whenWords as words } from "./when-words.ts";

/** Props for {@link OnTimeHint}. */
export interface OnTimeHintProps {
  /** One routine ("Starts on time…") or the list's routines ("Routines start on time…"). */
  readonly of: "routine" | "routines";
}

/**
 * Says that routines start on time while Halonic is open: the app's engine starts them only while
 * its window is open (HAL-14205).
 */
export function OnTimeHint({ of }: OnTimeHintProps) {
  return <>{words.onTime[of]}</>;
}
