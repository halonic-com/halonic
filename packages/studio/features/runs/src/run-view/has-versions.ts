import { useEffect, useState } from "react";
import type { VersionHistoryHost } from "../api.ts";

/**
 * Whether the workspace has a version history, asked once per page: `undefined` until the host
 * answers. Where the app can't tell, or its history can't be read, it counts as having one, so
 * Ran on shows as it did before, never hiding a version a run did record.
 */
export function useHasVersions(host: VersionHistoryHost | undefined): boolean | undefined {
  const [hasVersions, setHasVersions] = useState<boolean | undefined>(
    host === undefined ? true : undefined,
  );
  useEffect(() => {
    if (host === undefined) return;
    let current = true;
    const answer = (has: boolean) => {
      if (current) setHasVersions(has);
    };
    host.hasVersions().then(answer, () => answer(true));
    return () => {
      current = false;
    };
  }, [host]);
  return hasVersions;
}
