// Whether this computer can run the plugins' programs, as the trust check reads it when it opens
// (HAL-3384, the "Runs" line design section 6). Until the app answers, or when it can't, the
// Programs rows keep the line that holds either way.

import { useEffect, useState } from "react";
import type { ProgramsRun } from "./trust-text.ts";

/**
 * Reads whether the plugins' programs can run here when the trust check opens. `undefined` while
 * the app answers, when it can't, and when there's nothing to ask. An answer that comes after the
 * dialog closed is dropped.
 *
 * @example
 * const programsRun = useProgramsRun(actions.programs);
 */
export function useProgramsRun(programs: (() => Promise<ProgramsRun>) | undefined): ProgramsRun {
  const [programsRun, setProgramsRun] = useState<ProgramsRun>(undefined);
  useEffect(() => {
    if (programs === undefined) return;
    let open = true;
    programs().then(
      (answer) => {
        if (open) setProgramsRun(answer);
      },
      () => undefined,
    );
    return () => {
      open = false;
    };
  }, [programs]);
  return programsRun;
}
