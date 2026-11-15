import { useEffect, useId, useState } from "react";
import { USED_BY, USED_BY_NONE, usedByLine } from "./page-text.ts";
import {
  CHECKING_USED_BY,
  type PluginActions,
  type PluginUse,
  USED_BY_UNKNOWN,
} from "./plugin-actions.ts";

/** The props of `UsedBy`. */
export interface UsedByProps {
  readonly plugin: string;
  readonly usedBy: PluginActions["usedBy"];
}

/**
 * Used by (design section 7): the connectors, in any workspace on this computer, whose transport is
 * this plugin, each with its workspace, so a person sees what a removal or a change would reach.
 * It shows while the plugin is on, off or can't load. While Halonic looks it says so, and when it
 * can't tell it says that rather than "none". Names are the person's own text: plain text only.
 *
 * @example
 * <UsedBy plugin="weather" usedBy={actions.usedBy} />
 */
export function UsedBy({ plugin, usedBy }: UsedByProps) {
  const headingId = useId();
  const [uses, setUses] = useState<readonly PluginUse[] | "unknown" | undefined>(undefined);

  useEffect(() => {
    let current = true;
    setUses(undefined);
    usedBy(plugin).then(
      (found) => {
        if (current) setUses(found);
      },
      () => {
        if (current) setUses("unknown");
      },
    );
    return () => {
      current = false;
    };
  }, [plugin, usedBy]);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-heading">
        {USED_BY}
      </h2>
      <UseList uses={uses} />
    </section>
  );
}

/** The connectors, one to a line, or the one line that says why there are none. */
function UseList({ uses }: { readonly uses: readonly PluginUse[] | "unknown" | undefined }) {
  if (uses === undefined || uses === "unknown" || uses.length === 0) {
    let words = USED_BY_NONE;
    if (uses === undefined) words = CHECKING_USED_BY;
    else if (uses === "unknown") words = USED_BY_UNKNOWN;
    return <p className="text-small text-fg-muted">{words}</p>;
  }
  return (
    <ul className="flex list-none flex-col gap-1">
      {uses.map((use) => (
        <li key={`${use.workspace}/${use.connector}`} className="text-small wrap-anywhere">
          {usedByLine(use.connector, use.workspace)}
        </li>
      ))}
    </ul>
  );
}
