import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { button, type FakeStudio, fakeStudio } from "../fake-studio.test-helper.ts";
import { newRequestText } from "../place-words.ts";
import type { Rect } from "../webdriver.ts";
import { screenText } from "../words.ts";
import { answerParts, answerRowFault, requestParts, waitCardAnswers } from "./wait-card.ts";

/** A 600px row, and its answers on one line at their natural width, Approve at the right end. */
const row = { x: 0, y: 100, width: 600, height: 40 };
const reject = { x: 400, y: 104, width: 80, height: 32 };
const approve = { x: 488, y: 104, width: 112, height: 32 };

/**
 * The demo open on Support reply, whose Inbox has New request; Send lists the run's wait card,
 * which opens by itself with its answers drawn where `first` says, unless `drawn` is false.
 */
function demoWithRequest(first: Rect = approve, drawn = true): FakeStudio {
  const studio = fakeStudio("Support reply");
  const setText = (text: string) => {
    const main = studio.windows.get("main");
    if (main !== undefined) main.text = text;
  };
  button(studio, "main", screenText.inbox.text);
  button(studio, "main", newRequestText.text);
  button(studio, "main", requestParts.messageBox);
  button(studio, "main", requestParts.send, () => {
    setText(`Inbox ${screenText.waitTitle.text}`);
    if (!drawn) return;
    studio.elements.set(answerParts.first, 1);
    studio.rects.set(answerParts.row, row);
    studio.rects.set(answerParts.first, first);
    studio.rects.set(answerParts.other, reject);
  });
  return studio;
}

verifies("studio-click-test.wait-card-row", () => {
  it("requests a reply from the Inbox and passes on the card's right-aligned row", async () => {
    const studio = demoWithRequest();
    await expect(waitCardAnswers.run(studio.context)).resolves.toEqual({ passed: true });
    expect(studio.clicks).toEqual([
      screenText.inbox.text,
      newRequestText.text,
      requestParts.messageBox,
      requestParts.send,
    ]);
    expect(studio.typed).toHaveLength(1);
  });

  it("fails as WAIT_ANSWERS_LAYOUT, naming the boxes, when Approve is at the left", async () => {
    const studio = demoWithRequest({ ...approve, x: 280 });
    const outcome = await waitCardAnswers.run(studio.context);
    expect(outcome).toMatchObject({ passed: false, code: "WAIT_ANSWERS_LAYOUT" });
    expect(outcome.passed ? "" : outcome.note).toContain("Approve 112×32 at 280,104");
  });

  it("fails as NO_WAIT_ANSWERS when the card's answers never show", async () => {
    const studio = demoWithRequest(approve, false);
    button(studio, "main", screenText.waitTitle.text);
    await expect(waitCardAnswers.run(studio.context)).resolves.toMatchObject({
      passed: false,
      code: "NO_WAIT_ANSWERS",
    });
    expect(studio.clicks.at(-1)).toBe(screenText.waitTitle.text);
  });

  it("fails as NO_WAIT_CARD when the run never reaches its wait step", async () => {
    const studio = demoWithRequest();
    button(studio, "main", requestParts.send);
    await expect(waitCardAnswers.run(studio.context)).resolves.toMatchObject({
      passed: false,
      code: "NO_WAIT_CARD",
    });
  });

  it("passes one right-aligned row with Approve at its right end", () => {
    expect(answerRowFault(row, approve, reject)).toBeUndefined();
  });

  it("fails when Approve is on a line under Reject", () => {
    expect(answerRowFault(row, { ...approve, x: 0, y: 140 }, reject)).toMatch(/aren't in one row/);
  });

  it("fails when Approve is at the left of Reject, naming every box", () => {
    const left = answerRowFault(row, { ...approve, x: 280 }, { ...reject, x: 520 });
    expect(left).toBe(
      "Approve isn't at the right of Reject (row 600×40 at 0,100, Approve 112×32 at 280,104, Reject 80×32 at 520,104).",
    );
  });

  it("fails when Approve doesn't end the row", () => {
    expect(answerRowFault(row, { ...approve, x: 400 }, { ...reject, x: 300 })).toMatch(
      /right edge/,
    );
  });

  it("fails when the answers are stretched to fill the row", () => {
    const stretched = answerRowFault(
      row,
      { ...approve, x: 304, width: 296 },
      { ...reject, x: 0, width: 296 },
    );
    expect(stretched).toMatch(/natural width/);
  });
});
