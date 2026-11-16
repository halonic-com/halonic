import { type InboxDecisions, WaitCard } from "@halonicjs/studio-feature-inbox/api";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/*
 * The Inbox card of a made-up Review pull request run waiting at "Publish the review?", for
 * halonic.dev (HAL-10732): Approve and Reject. It is a wait step's card (`WaitCard`), the one that
 * takes its title from the step's description.
 */

const asked = new Date(2026, 10, 9, 10, 40, 53);

const item = {
  kind: "wait",
  key: "run_mfx3k2a1_7f3a2b:approve",
  runId: "run_mfx3k2a1_7f3a2b",
  state: "approve",
  title: "Publish the review?",
  body: "",
  accepts: ["approve", "reject"],
  answerLabels: {},
  since: asked.toISOString(),
  waitingAt: asked.toISOString(),
  movesOnAt: null,
} as const;

const decisions: Pick<InboxDecisions, "answer"> = {
  answer: () => new Promise(() => undefined),
};

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The approval page needs its #root element (approval.html).");
}
createRoot(root).render(
  <StrictMode>
    {/* The screenshot's frame: the card's own width, as tall as its content. */}
    <div id="shot" className="w-[28rem] bg-surface text-fg">
      <WaitCard
        item={item}
        decisions={decisions}
        next={null}
        back={null}
        now={() => new Date(asked.getTime() + 2 * 60_000)}
        onOpenRun={() => undefined}
      />
    </div>
  </StrictMode>,
);
