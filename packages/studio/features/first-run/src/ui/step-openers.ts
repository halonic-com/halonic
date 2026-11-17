import { InboxService } from "@halonicjs/studio-feature-inbox/api";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import type { SampleStepId } from "../api.ts";
import { type SampleProgress, SUPPORT_WORKFLOW } from "../sample-progress.ts";
import { sampleRefundEmail } from "../sample-text.ts";

/** What each step of the Try the sample card does when it's opened. */
export type StepOpeners = Readonly<Record<SampleStepId, () => void>>;

/**
 * What each step opens (flow-first-run 3.3). Step 1 opens the Inbox's request form with the
 * invented refund email in Message, ready to send, and focus there. Step 2 opens the newest wait card; with none waiting it does what step 1
 * does. Step 3 opens the latest finished run's page; before one, it does what the next open step
 * does.
 */
export function stepOpeners(context: WorkspaceContext, progress: SampleProgress): StepOpeners {
  const inbox = context.services.get(InboxService);
  const startRequest = () => {
    inbox.requestNewRequest(sampleRefundEmail);
    context.openPlace?.("inbox");
  };
  const decide = () => {
    const waiting = inbox.state.items.find((item) => item.kind === "wait");
    if (waiting === undefined) return startRequest();
    inbox.requestOpen(waiting.key);
    context.openPlace?.("inbox");
  };
  const see = () => {
    const { finishedRun, done } = progress.state;
    if (finishedRun !== undefined) return context.openItem?.(finishedRun);
    return done.has("start") ? decide() : startRequest();
  };
  return { start: startRequest, decide, see };
}

/**
 * What **Run its tests** does: opens the sample's support workflow, in the hub of its runs, on its
 * Tests. Absent where the window can't open a page.
 */
export function testsOpener(context: WorkspaceContext): ((hub: string) => void) | undefined {
  const { openItem } = context;
  if (openItem === undefined) return undefined;
  return (hub) => openItem({ kind: "workflow", hub, id: SUPPORT_WORKFLOW }, { step: "tests" });
}
