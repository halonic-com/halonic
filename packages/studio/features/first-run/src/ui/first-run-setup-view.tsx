import type { SetupViewProps } from "@halonicjs/studio-feature-inbox/api";
import { Button } from "@halonicjs/studio-kit";
import { useEffect, useRef } from "react";
import { type FirstRun, SUPPORT_HUB, SUPPORT_WORKFLOW } from "../first-run.ts";
import { firstRunSteps } from "../first-run-state.ts";
import { setupWords } from "../first-run-words.ts";
import { useFirstRunState } from "./first-run-bar.tsx";

/** Props for {@link FirstRunSetupView}: the Inbox's, and the first run the item is about. */
export interface FirstRunSetupViewProps extends SetupViewProps {
  readonly firstRun: FirstRun;
}

/**
 * The open setup item of a paused first run (`first-run.setup-item`): its title, which takes focus
 * as it opens, the four-piece progress, the step line, **Continue**, which takes the first run up
 * again and opens Support reply where it was left, and **Dismiss**, which leaves it for good.
 */
export function FirstRunSetupView({ item, firstRun, openItem, close }: FirstRunSetupViewProps) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);
  const state = useFirstRunState(firstRun);
  const step = state.kind === "paused" ? state.step : undefined;
  const reached = step === undefined ? firstRunSteps.length : firstRunSteps.indexOf(step);
  return (
    <section className="flex flex-col gap-4 p-6">
      <h2 ref={title} tabIndex={-1} className="text-title">
        {item.title}
      </h2>
      <div className="flex flex-col gap-2">
        <div aria-hidden="true" className="grid grid-cols-4 gap-1">
          {firstRunSteps.map((each, index) => (
            <span
              key={each}
              className={`h-1 rounded-full ${index < reached ? "bg-accent" : "bg-surface-muted"}`}
            />
          ))}
        </div>
        <p className="text-small text-fg-muted">{item.progress}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => {
            firstRun.send({ kind: "resumed" });
            openItem?.({ kind: "workflow", hub: SUPPORT_HUB, id: SUPPORT_WORKFLOW });
          }}
        >
          {setupWords.continue}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            close();
            firstRun.send({ kind: "dismissed" });
          }}
        >
          {setupWords.dismiss}
        </Button>
      </div>
    </section>
  );
}
