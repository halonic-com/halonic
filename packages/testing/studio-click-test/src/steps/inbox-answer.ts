import type { Step, StepContext, StepOutcome } from "../runner.ts";
import { clickRow, clickWhenShown, lastWords, rowContaining, waitForText } from "../screen.ts";
import { seedNames } from "../test-paperclip.ts";
import { buttonLabels, screenText } from "../words.ts";
import { inboxRowFit } from "./inbox-row-fit.ts";
import { closeDialogs, onWorkspace, openPlace } from "./open-demo.ts";
import { sidebarRowSize } from "./plain-row-size.ts";

/** How long the Inbox may take to read the newly connected Paperclip. */
const cardWaitMs = 90_000;

/**
 * Whether the Inbox says its list is what it read last: the engine's line, a refusal's
 * ("Showing what was read last."), or the agents' items' ("Couldn't load the items from your agents.").
 */
function isStale(text: string): boolean {
  return [screenText.engineShowingLast, screenText.staleInbox, screenText.agentLoadFailed].some(
    (line) => text.includes(line.text),
  );
}

/**
 * A `STALE_INBOX` failure with the screen's last words, which load failed as the line's
 * `data-failed` says it (`inbox.stale-source`), and the shell log's engine and agent host lines.
 */
async function stale(context: StepContext, text: string): Promise<StepOutcome> {
  const failed = await context.driver.attribute(staleLine, "data-failed").catch(() => null);
  const log = await context.shellLog();
  const note = `${lastWords(text)}\nFailed load: ${failed ?? "(not named)"}\nshell.log:\n${log}`;
  return { passed: false, code: "STALE_INBOX", note };
}

/** The Inbox's stale line, which names the load that failed. */
const staleLine = "//*[@data-failed]";

/** An XPath test that the element has the class `name`. */
function hasClass(name: string): string {
  return `contains(concat(' ', normalize-space(@class), ' '), ' ${name} ')`;
}

/**
 * The seeded card's row in the Inbox's plain List: its box, its avatar's 48px place, its title
 * (the plain row's 15px reading text), its meta line (the 14px body text under it) and its
 * avatar's badge.
 */
const cardRow = rowContaining(screenText.strategyApproval.text);
export const cardRowParts = {
  row: `${cardRow}/*[1]`,
  picture: `${cardRow}//*[${hasClass("size-12")}]`,
  title: `(${cardRow}//span[${hasClass("text-reading")}])[1]`,
  meta: `(${cardRow}//span[${hasClass("text-body")}])[1]`,
  badge: `${cardRow}//*[@data-avatar-badge]`,
} as const;

/**
 * Goes back from the answered card to the list, which then shows Needs you and any stale line.
 * An answered Paperclip card can stay open with its "Answered at" line, and in a narrow window it
 * hides the list (run 45834340178).
 */
async function backToList(
  context: StepContext,
): Promise<{ value: true | undefined; text: string }> {
  await clickWhenShown(context, screenText.backToInbox.text, 10_000);
  return waitForText(context, 30_000, (text) =>
    text.includes(screenText.nothingWaiting.text) ? true : undefined,
  );
}

/**
 * Step 9: the Inbox shows the seeded board card, and Approve answers it. The
 * row shows the card's type; the card shows its title, from a fresh read: no
 * line says the Inbox shows what it read last, over the card or over the list after the answer
 * (HAL-19190). The card's row is exactly 72px high with a 48px avatar (HAL-20558, HAL-20675),
 * its title clamped to two lines, its meta line cut on one and its avatar's badge 20px
 * (HAL-20759). The click must reach the test Paperclip: its API says approved, and the card
 * leaves Needs you.
 */
export const inboxAnswer: Step = {
  id: "inbox-answer",
  title: "Inbox: the seeded card shows, and Approve answers it on Paperclip",
  requirements: [
    "inbox.every-waiting-item",
    "inbox.decisions",
    "paperclip-client.approval-fields",
    "studio.desktop-agent-messaging",
    "kit.plain-row-size",
    "kit.plain-row-fit",
    "kit.avatar-badge",
    "inbox.row-meta-wraps",
    "inbox.header-avatar",
    "inbox.proposal-page",
  ],
  needs: ["connect-paperclip"],
  run: async (context) => {
    const workspace = await onWorkspace(context);
    if (!workspace.passed) return workspace;
    await closeDialogs(context);
    if (!(await openPlace(context, screenText.inbox.text))) {
      return { passed: false, code: "NO_INBOX", note: "No Inbox in Places." };
    }
    // The row is read before the click: a narrow window hides the list once the card opens.
    const listed = await waitForText(context, cardWaitMs, (text) =>
      text.includes(screenText.strategyApproval.text) ? true : undefined,
    );
    if (listed.value !== true) {
      return { passed: false, code: "NO_CARD", note: lastWords(listed.text) };
    }
    const size = await sidebarRowSize(context, "The Inbox's card row", cardRowParts);
    if (!size.passed) return size;
    const fit = await inboxRowFit(context, "The Inbox's card row", cardRowParts);
    if (!fit.passed) return fit;
    const shown = await clickRow(context, screenText.strategyApproval.text, cardWaitMs);
    const card = await waitForText(context, shown ? 20_000 : 0, (text) =>
      text.includes(seedNames.card) ? true : undefined,
    );
    if (card.value !== true) return { passed: false, code: "NO_CARD", note: lastWords(card.text) };
    if (isStale(card.text)) return stale(context, card.text);
    if (!(await clickWhenShown(context, buttonLabels.approve.text, 10_000))) {
      return { passed: false, code: "NO_ANSWER_BUTTON", note: lastWords(card.text) };
    }
    const shownAnswered = await waitForText(context, 30_000, (text) =>
      text.includes(screenText.nothingWaiting.text) ? true : undefined,
    );
    const status = await context.paperclip.approvalStatus();
    if (status !== "approved") {
      const note = `Paperclip says ${status}. Screen: ${lastWords(shownAnswered.text)}`;
      return { passed: false, code: "NOT_ANSWERED_ON_PAPERCLIP", note };
    }
    const answered = shownAnswered.value === true ? shownAnswered : await backToList(context);
    if (answered.value !== true) {
      return { passed: false, code: "NO_ANSWERED_LINE", note: lastWords(answered.text) };
    }
    // In a narrow window the open card hides the list and its line, so the list is checked again
    // once the answer closed the card (run 45807805141).
    if (isStale(answered.text)) return stale(context, answered.text);
    return { passed: true };
  },
};
