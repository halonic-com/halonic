// Whether a trusted plugin is off on this computer because its code doesn't run in the sandbox
// here and the person's yes isn't saved for the reason that holds now (microcopy 24.1 R13). The
// plugin page's Callout and the Plugins list's chip both ask it this way, so they never disagree
// (C540, HAL-15080). The trust check's **Trust** stays unavailable until its box is ticked then,
// so its toast never says "on" for such a plugin.

import { useEffect, useState } from "react";
import type { InstalledPlugin } from "../page/plugin-pages.ts";
import {
  type PluginUnfencedRuns,
  type TrustStatus,
  trustStatusOf,
  type UnfencedRunStatus,
} from "./unfenced-status.ts";

/** Whether the host is asked about `plugin` at all: it's on and has a backend. */
export function asksAboutYes(plugin: InstalledPlugin): boolean {
  return plugin.status === "on" && plugin.manifest?.backend !== undefined;
}

/**
 * Whether the trust check's status means R13: plugin code doesn't run in the sandbox here and no
 * yes for that reason is saved. Checking, the sandbox, and a host that can't say aren't R13.
 */
export function isOffHere({ fence, yes }: TrustStatus): boolean {
  return fence?.state === "not-fenced" && yes?.reason !== fence.reason;
}

/** {@link isOffHere} for the host's answer. */
function offHereOf(status: UnfencedRunStatus): boolean {
  return isOffHere(trustStatusOf(status, new Date()));
}

/**
 * Whether the plugins the list shows on are off on this computer (R13). The host is asked once for
 * all of them, since one yes covers every plugin, and only while one of them has a backend; it's
 * asked again when those plugins or their trust change, so a yes given in the trust check shows.
 * A host that can't say leaves them looking on, as their pages do.
 */
export function useOffHere(
  unfencedRuns: PluginUnfencedRuns | undefined,
  plugins: readonly InstalledPlugin[],
): boolean {
  const asked = plugins
    .filter(asksAboutYes)
    .map((plugin) => `${plugin.plugin} ${plugin.trustedAt ?? ""}`)
    .join("\n");
  const [offHere, setOffHere] = useState(false);
  useEffect(() => {
    if (unfencedRuns === undefined || asked === "") {
      setOffHere(false);
      return;
    }
    let current = true;
    unfencedRuns.status().then(
      (status) => {
        if (current) setOffHere(offHereOf(status));
      },
      () => {
        if (current) setOffHere(false);
      },
    );
    return () => {
      current = false;
    };
  }, [unfencedRuns, asked]);
  return offHere;
}
