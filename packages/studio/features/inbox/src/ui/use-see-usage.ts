import type { AccountMenuHost } from "@halonicjs/studio-feature-account-menu/api";
import { useEffect, useState } from "react";

/**
 * **See usage** on a run at a plan limit: opens the account page's plan (AC-00 #plan), the
 * address the account menu reads from the computer. `undefined`, so the card has no **See usage**,
 * where there's no account menu (the desktop app, or many users without Cloud sign-in), and while
 * or when its facts don't load: the account menu says itself that it couldn't load them.
 */
export function useSeeUsage(host: AccountMenuHost | undefined): (() => void) | undefined {
  const [planUrl, setPlanUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (host === undefined) return;
    let current = true;
    host.load().then(
      (facts) => {
        if (current) setPlanUrl(facts?.planUrl);
      },
      () => {
        if (current) setPlanUrl(undefined);
      },
    );
    return () => {
      current = false;
    };
  }, [host]);
  if (host === undefined || planUrl === undefined) return undefined;
  return () => host.open(planUrl);
}
