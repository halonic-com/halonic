import { useState } from "react";
import {
  type ConfigurationPage,
  configurationStart,
} from "../configuration/configuration-pages.ts";

/** What the start card's **Open Problems** changes on the page. */
export interface ProblemsOpener {
  /** Closes the docked card. */
  readonly setDock: (dock: undefined) => void;
  /** Forgets a made test, so Configuration opens on Problems rather than Tests. */
  readonly setMadeTest: (madeTest: undefined) => void;
  readonly showView: (view: "configuration") => void;
}

/**
 * The start card's **Open Problems**: `open` shows Configuration and asks it to start on Problems.
 * The ask is a count, so a second ask while Configuration shows opens Problems again. Showing
 * another tab forgets the ask, during that render. `key` and `startOn` are for Configuration: the
 * key remounts it for each made test and each ask. `view` is the tab the page shows.
 */
export function useOpenProblems(
  view: string,
  madeTest: { readonly n: number } | undefined,
  page: ProblemsOpener,
): { readonly key: string; readonly startOn: ConfigurationPage | undefined; open(): void } {
  const [asked, setAsked] = useState<number | undefined>();
  const onConfiguration = view === "configuration";
  if (!onConfiguration && asked !== undefined) setAsked(undefined);
  const problemsAsked = onConfiguration ? asked : undefined;
  return {
    key: `${madeTest?.n ?? 0}/${problemsAsked ?? 0}`,
    startOn: configurationStart(madeTest, problemsAsked),
    open: () => {
      page.setDock(undefined);
      page.setMadeTest(undefined);
      page.showView("configuration");
      setAsked((count) => (count ?? 0) + 1);
    },
  };
}
