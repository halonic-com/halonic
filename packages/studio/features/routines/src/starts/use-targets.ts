import { useEffect, useState } from "react";
import type { RoutineRef, RoutinesHost, RoutineTargetChoice } from "../api.ts";

/**
 * What the routine's hub lets it start, read again when the routine's hub changes. Empty while it
 * is read, and when it can't be: the picker then shows only what the file names.
 */
export function useTargets(host: RoutinesHost, ref: RoutineRef): readonly RoutineTargetChoice[] {
  const [targets, setTargets] = useState<readonly RoutineTargetChoice[]>([]);
  const { hubId, id } = ref;
  useEffect(() => {
    let current = true;
    host.targets({ hubId, id }).then(
      (found) => current && setTargets(found),
      () => current && setTargets([]),
    );
    return () => {
      current = false;
    };
  }, [host, hubId, id]);
  return targets;
}
