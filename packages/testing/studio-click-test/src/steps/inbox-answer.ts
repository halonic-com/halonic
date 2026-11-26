import type { Step } from "../runner.ts";
import { clickRow, clickWhenShown, lastWords, waitForText } from "../screen.ts";
import { seedNames } from "../test-paperclip.ts";
import { buttonLabels, screenText } from "../words.ts";
import { closeDialogs, onWorkspace, openPlace } from "./open-demo.ts";

/** How long the Inbox may take to read the newly connected Paperclip. */
const cardWaitMs = 90_000;

/**
 * Step 8: the Inbox shows the seeded board card, and Approve answers it. The
 * row shows the card's type; the card shows its title. The click must reach
 * the test Paperclip: its API says approved, and the card leaves Needs you.
 */
export const inboxAnswer: Step = {
  id: "inbox-answer",
  title: "Inbox: the seeded card shows, and Approve answers it on Paperclip",
  requirements: [
    "inbox.every-waiting-item",
    "inbox.decisions",
    "paperclip-client.approval-fields",
    "studio.desktop-agent-messaging",
  ],
  needs: ["connect-paperclip"],
  run: async (context) => {
    const workspace = await onWorkspace(context);
    if (!workspace.passed) return workspace;
    await closeDialogs(context);
    if (!(await openPlace(context, screenText.inbox.text))) {
      return { passed: false, code: "NO_INBOX", note: "No Inbox in Places." };
    }
    const shown = await clickRow(context, screenText.strategyApproval.text, cardWaitMs);
    const card = await waitForText(context, shown ? 20_000 : 0, (text) =>
      text.includes(seedNames.card) ? true : undefined,
    );
    if (card.value !== true) return { passed: false, code: "NO_CARD", note: lastWords(card.text) };
    if (!(await clickWhenShown(context, buttonLabels.approve.text, 10_000))) {
      return { passed: false, code: "NO_ANSWER_BUTTON", note: lastWords(card.text) };
    }
    const answered = await waitForText(context, 30_000, (text) =>
      text.includes(screenText.nothingWaiting.text) ? true : undefined,
    );
    const status = await context.paperclip.approvalStatus();
    if (status !== "approved") {
      const note = `Paperclip says ${status}. Screen: ${lastWords(answered.text)}`;
      return { passed: false, code: "NOT_ANSWERED_ON_PAPERCLIP", note };
    }
    if (answered.value !== true) {
      return { passed: false, code: "NO_ANSWERED_LINE", note: lastWords(answered.text) };
    }
    return { passed: true };
  },
};
