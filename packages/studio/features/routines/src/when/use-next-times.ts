import { useEffect, useState } from "react";
import type { RoutineNextTimes, RoutineRef, RoutinesHost } from "../api.ts";

/** How many start times the Next line shows. */
const SHOWN = 3;

/**
 * The routine's next start times from its live version, read again each time `routine` is a new
 * read. `undefined` while it waits, and when it can't say: the line is then left out, as a
 * quiet extra never takes the card down with it.
 */
export function useNextTimes(
  host: RoutinesHost,
  ref: RoutineRef,
  shown: boolean,
  routine: unknown,
): RoutineNextTimes | undefined {
  const [times, setTimes] = useState<RoutineNextTimes | undefined>();
  const { hubId, id } = ref;
  useEffect(() => {
    if (!shown) {
      setTimes(undefined);
      return;
    }
    let current = true;
    host.nextTimes({ hubId, id }, SHOWN).then(
      (answer) => current && setTimes(answer),
      () => current && setTimes(undefined),
    );
    return () => {
      current = false;
    };
  }, [host, hubId, id, shown, routine]);
  return times;
}
