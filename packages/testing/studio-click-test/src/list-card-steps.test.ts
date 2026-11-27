import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { checkboxCard, suggestedTasksCard, verdictsCard } from "./card-fixtures.ts";
import { holds } from "./card-step.ts";
import { type Answers, cardStudio, statusOf } from "./card-studio.test-helper.ts";
import { answerRadio, cardCheckbox, cardSuggestedTasks, cardVerdicts } from "./steps/card-kinds.ts";
import { buttonLabels } from "./words.ts";

/** A copy whose `picks` do nothing on their own, and whose Submit leaves `status` and `result`. */
function submitting(picks: readonly string[], status: string, result: unknown): Answers {
  const pending = Object.fromEntries(picks.map((pick) => [pick, { status: "pending" }]));
  return { ...pending, [buttonLabels.submit.text]: { status, result } };
}

verifies("studio-click-test.list-card-steps", () => {
  describe("the checkbox card step", () => {
    it("ticks each surface's picks, submits them, and checks Paperclip has them in any order", async () => {
      const studio = cardStudio(
        checkboxCard,
        submitting(["Email", "Blog"], "accepted", { selectedOptionIds: ["blog", "email"] }),
        submitting(["Social"], "accepted", { selectedOptionIds: ["social"], version: 1 }),
      );
      await expect(cardCheckbox.run(studio.context)).resolves.toEqual({ passed: true });
      expect(
        studio.clicks.filter((each) => ["Email", "Blog", "Social", "Submit"].includes(each)),
      ).toEqual(["Email", "Blog", "Submit", "Social", "Submit"]);
    });

    it("fails as WRONG_ANSWER, naming the Messenger, when Paperclip has another pick", async () => {
      const studio = cardStudio(
        checkboxCard,
        submitting(["Email", "Blog"], "accepted", { selectedOptionIds: ["email", "blog"] }),
        submitting(["Social"], "accepted", { selectedOptionIds: ["blog"] }),
      );
      await expect(cardCheckbox.run(studio.context)).resolves.toMatchObject({
        code: "WRONG_ANSWER",
        note: expect.stringMatching(/^Messenger: Paperclip has .*"blog"/),
      });
    });
  });

  describe("the item verdict card step", () => {
    const verdicts = (teaser: string, recap: string) => ({
      items: [
        { id: "recap", verdict: recap, resolvedAt: "2026-11-27T16:00:00Z" },
        { id: "teaser", verdict: teaser, resolvedAt: "2026-11-27T16:00:00Z" },
      ],
    });

    it("gives each item its verdict and passes whatever else Paperclip adds", async () => {
      const studio = cardStudio(
        verdictsCard,
        submitting(["Approve", "Defer"], "answered", verdicts("approve", "defer")),
        submitting(["Defer", "Approve"], "answered", verdicts("defer", "approve")),
      );
      await expect(cardVerdicts.run(studio.context)).resolves.toEqual({ passed: true });
      expect(statusOf(studio, "messenger-verdicts")).toBe("answered");
    });

    it("fails as NO_OPTION, naming the Inbox, when an item has no such verdict", async () => {
      const studio = cardStudio(
        verdictsCard,
        submitting(["Approve"], "answered", verdicts("approve", "defer")),
        submitting(["Defer", "Approve"], "answered", verdicts("defer", "approve")),
      );
      await expect(cardVerdicts.run(studio.context)).resolves.toMatchObject({
        code: "NO_OPTION",
        note: expect.stringMatching(/^Inbox: No .*'recap'/),
      });
    });

    it("finds an item's radio inside that item's question only", () => {
      expect(answerRadio("recap", "Defer")).toMatch(/^\/\/fieldset\[@data-question='recap'\]\/\//);
    });
  });

  describe("the suggested-task card step", () => {
    const made = (picked: string, skipped: string) => ({
      createdTasks: [{ clientKey: picked, issueId: "task-9" }],
      skippedClientKeys: [skipped],
    });
    const press = "Acme: write the press note";
    const survey = "Acme: send the launch survey";

    it("makes one draft on each surface and skips the other", async () => {
      const studio = cardStudio(
        suggestedTasksCard,
        submitting([press], "accepted", made("press", "survey")),
        submitting([survey], "accepted", made("survey", "press")),
      );
      await expect(cardSuggestedTasks.run(studio.context)).resolves.toEqual({ passed: true });
    });

    it("fails as WRONG_ANSWER when Paperclip made the other draft", async () => {
      const studio = cardStudio(
        suggestedTasksCard,
        submitting([press], "accepted", made("survey", "press")),
        submitting([survey], "accepted", made("survey", "press")),
      );
      await expect(cardSuggestedTasks.run(studio.context)).resolves.toMatchObject({
        code: "WRONG_ANSWER",
        note: expect.stringMatching(/^Inbox: Paperclip has/),
      });
    });
  });
});

describe("holds", () => {
  it("matches the fields named, a list in any order, and nothing missing", () => {
    expect(
      holds({ a: 1, b: [{ id: "x", at: 2 }, { id: "y" }] }, { b: [{ id: "y" }, { id: "x" }] }),
    ).toBe(true);
    expect(holds({ b: [{ id: "x" }] }, { b: [{ id: "x" }, { id: "x" }] })).toBe(false);
    expect(holds({ b: [{ id: "x" }, { id: "y" }] }, { b: [{ id: "x" }] })).toBe(false);
    expect(holds({ a: "1" }, { a: 1 })).toBe(false);
    expect(holds(undefined, { a: 1 })).toBe(false);
  });
});
