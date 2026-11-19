import { whenWords as words } from "./when-words.ts";

/** Props for {@link OnTimeHint}. */
export interface OnTimeHintProps {
  /** One routine ("Starts on time…") or the list's routines ("Routines start on time…"). */
  readonly of: "routine" | "routines";
}

/**
 * Says that routines start on time only while `halonic routines watch` is running: the app has no
 * scheduler of its own yet, so a next time it shows is kept only by the command (HAL-12323).
 */
export function OnTimeHint({ of }: OnTimeHintProps) {
  return (
    <>
      {words.onTime[of]} <code>{words.onTime.command}</code> {words.onTime.end}
    </>
  );
}
