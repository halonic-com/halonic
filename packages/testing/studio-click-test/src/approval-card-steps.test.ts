import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { decisionCard, hireCard, strategyCard } from "./card-fixtures.ts";
import { cardStudio, statusOf } from "./card-studio.test-helper.ts";
import { cardDecision, cardHire, cardStrategy, changesNote } from "./steps/approval-cards.ts";
import { buttonLabels, screenText, words } from "./words.ts";

/** The line a chat card says under it when it leaves Request changes to the Inbox. */
const leavesChanges = words.messengerNeedsNote([buttonLabels.requestChanges.text]);

verifies("studio-click-test.approval-card-steps", () => {
  describe("the hire approval step", () => {
    it("approves in the Inbox and rejects in the chat, which leaves Request changes out", async () => {
      const studio = cardStudio(
        hireCard,
        { [buttonLabels.approve.text]: { status: "approved" } },
        { [buttonLabels.reject.text]: { status: "rejected" } },
        { chatText: leavesChanges },
      );
      await expect(cardHire.run(studio.context)).resolves.toEqual({ passed: true });
      expect(statusOf(studio, "inbox-hire")).toBe("approved");
      expect(statusOf(studio, "messenger-hire")).toBe("rejected");
    });

    it("opens the next row with the approval's type when the first shows another title", async () => {
      const studio = cardStudio(
        hireCard,
        { [buttonLabels.approve.text]: { status: "approved" } },
        { [buttonLabels.reject.text]: { status: "rejected" } },
        { chatText: leavesChanges, otherRowFirst: true },
      );
      await expect(cardHire.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks.filter((each) => each === hireCard.inboxRow)).toHaveLength(2);
      expect(studio.clicks).toContain(screenText.backToInbox.text);
    });

    it("fails as NO_NOTE_LINE when the chat doesn't say Request changes is in the Inbox", async () => {
      const studio = cardStudio(
        hireCard,
        { [buttonLabels.approve.text]: { status: "approved" } },
        { [buttonLabels.reject.text]: { status: "rejected" } },
      );
      await expect(cardHire.run(studio.context)).resolves.toMatchObject({
        code: "NO_NOTE_LINE",
        note: expect.stringMatching(/^Messenger:/),
      });
    });
  });

  describe("the strategy approval step", () => {
    it("sends Request changes with its note from the Inbox and approves in the chat", async () => {
      const studio = cardStudio(
        strategyCard,
        {
          [buttonLabels.requestChanges.text]: {
            status: "revision_requested",
            result: { decisionNote: changesNote },
            shows: screenText.whatShouldChange.text,
          },
        },
        { [buttonLabels.approve.text]: { status: "approved", result: { decisionNote: null } } },
        { chatText: leavesChanges },
      );
      await expect(cardStrategy.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.typed).toEqual([changesNote]);
    });

    it("fails as NO_NOTE_FIELD when Request changes sends without its field", async () => {
      const studio = cardStudio(
        strategyCard,
        { [buttonLabels.requestChanges.text]: { status: "revision_requested" } },
        { [buttonLabels.approve.text]: { status: "approved" } },
        { chatText: leavesChanges },
      );
      await expect(cardStrategy.run(studio.context)).resolves.toMatchObject({
        code: "NO_NOTE_FIELD",
        note: expect.stringMatching(/^Inbox:/),
      });
    });

    it("fails as WRONG_ANSWER when Paperclip kept another note", async () => {
      const studio = cardStudio(
        strategyCard,
        {
          [buttonLabels.requestChanges.text]: {
            status: "revision_requested",
            result: { decisionNote: "something else" },
            shows: screenText.whatShouldChange.text,
          },
        },
        { [buttonLabels.approve.text]: { status: "approved" } },
        { chatText: leavesChanges },
      );
      await expect(cardStrategy.run(studio.context)).resolves.toMatchObject({
        code: "WRONG_ANSWER",
      });
    });
  });

  describe("the decision step", () => {
    it("picks an option on each surface and checks Paperclip decided it so", async () => {
      const studio = cardStudio(
        decisionCard,
        { Blue: { status: "decided", result: { chosenOptionId: "blue" } } },
        { Green: { status: "decided", result: { chosenOptionId: "green" } } },
      );
      await expect(cardDecision.run(studio.context)).resolves.toEqual({ passed: true });
    });

    it("fails as WRONG_ANSWER, naming the Messenger, when Paperclip has the other option", async () => {
      const studio = cardStudio(
        decisionCard,
        { Blue: { status: "decided", result: { chosenOptionId: "blue" } } },
        { Green: { status: "decided", result: { chosenOptionId: "blue" } } },
      );
      await expect(cardDecision.run(studio.context)).resolves.toMatchObject({
        code: "WRONG_ANSWER",
        note: expect.stringMatching(/^Messenger: Paperclip has/),
      });
    });
  });
});
