import type { InboxSetupSource, SetupViewProps } from "@halonicjs/studio-feature-inbox/api";
import { createElement } from "react";
import type { FirstRun } from "./first-run.ts";
import { setupWords } from "./first-run-words.ts";

/** The Inbox's provider id for the first run's setup item; its key is `setup:first-run:demo`. */
export const FIRST_RUN_SETUP = "first-run";

/**
 * The Inbox's setup item of a paused first run (`first-run.setup-item`, first-run-flow 5): one
 * item, "Finish your first run" at "Step 2 of 4 · Model", while the first run is paused in the open
 * folder. Its view has the four-piece progress, **Continue** and **Dismiss**. It goes when the
 * first run is taken up again, dismissed or won.
 *
 * @example
 * inbox.addSetupSource(firstRunSetupSource(firstRun));
 */
export function firstRunSetupSource(firstRun: FirstRun): InboxSetupSource {
  return {
    provider: FIRST_RUN_SETUP,
    name: setupWords.name,
    view: {
      view: "FirstRunSetupView",
      load: async () => {
        const { FirstRunSetupView } = await import("./ui/first-run-setup-view.tsx");
        // The Inbox gives a view only its own props, so the first run is added here.
        return {
          FirstRunSetupView: (props: SetupViewProps) =>
            createElement(FirstRunSetupView, { ...props, firstRun }),
        };
      },
    },
    list: async () => {
      const state = firstRun.state;
      if (state.kind !== "paused" || !firstRun.isPausedHere) return [];
      return [
        {
          account: "demo",
          title: setupWords.title,
          progress: setupWords.progress(state.step),
          changedAt: state.since,
        },
      ];
    },
    subscribe: (listener) => firstRun.subscribe(listener),
  };
}
