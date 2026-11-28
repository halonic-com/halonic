import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { checkboxCard, wrappingOption } from "../card-fixtures.ts";
import { type Answers, cardStudio, drawWrappingOption } from "../card-studio.test-helper.ts";
import { buttonLabels } from "../words.ts";
import { cardCheckbox } from "./card-kinds.ts";
import { type CheckboxWordsRead, checkboxWordsFault } from "./checkbox-words.ts";

/** A desktop's label: two 20px lines without padding, and the 16px box `boxTop` under its top. */
function desktop(boxTop: number, labelHeight = 40): CheckboxWordsRead {
  return {
    label: { x: 100, y: 300, width: 600, height: labelHeight },
    box: { x: 100, y: 300 + boxTop, width: 16, height: 16 },
    lineHeight: 20,
    paddingTop: 0,
    paddingBottom: 0,
  };
}

/** A copy whose `picks` do nothing on their own, and whose Submit leaves the card accepted with them. */
function submitting(picks: readonly string[], selectedOptionIds: readonly string[]): Answers {
  const pending = Object.fromEntries(picks.map((pick) => [pick, { status: "pending" }]));
  const submit = { status: "accepted", result: { selectedOptionIds } };
  return { ...pending, [buttonLabels.submit.text]: submit };
}

/** A Studio with the checkbox card on both surfaces, each answering with the step's own picks. */
function checkboxStudio() {
  return cardStudio(
    checkboxCard,
    submitting(["Email", "Blog"], ["email", "blog"]),
    submitting(["Social"], ["social"]),
  );
}

verifies("studio-click-test.checkbox-words-look", () => {
  describe("the wrapping option", () => {
    it("is on the checkbox card, unticked, within Paperclip's 120 characters", () => {
      const payload = checkboxCard.payload(checkboxCard.prompt) as {
        options: readonly { id: string; label: string }[];
        defaultSelectedOptionIds: readonly string[];
      };
      const option = payload.options.find((each) => each.label === wrappingOption);
      expect(option).toBeDefined();
      expect(payload.defaultSelectedOptionIds).not.toContain(option?.id);
      expect(wrappingOption.length).toBeLessThanOrEqual(120);
      // About 7px a character at the kit's 14px: wider than the 800px window, so it wraps there.
      expect(wrappingOption.length).toBeGreaterThanOrEqual(115);
    });
  });

  describe("checkboxWordsFault", () => {
    it("passes a box on the first of two lines, 2px down on a desktop", () => {
      expect(checkboxWordsFault(desktop(2))).toBeUndefined();
      expect(checkboxWordsFault(desktop(2.5))).toBeUndefined();
    });

    it("passes a phone's box, 4px down in a 24px line under 12px of padding", () => {
      const phone: CheckboxWordsRead = {
        label: { x: 16, y: 200, width: 358, height: 72 },
        box: { x: 16, y: 216, width: 16, height: 16 },
        lineHeight: 24,
        paddingTop: 12,
        paddingBottom: 12,
      };
      expect(checkboxWordsFault(phone)).toBeUndefined();
    });

    it("fails a box centred against both lines, as items-center draws it", () => {
      // An 18px box with its 2px margin, centred in 40px: its top is 13px down, its middle 21px.
      expect(checkboxWordsFault(desktop(13))).toEqual({
        code: "CHECKBOX_WORDS_LAYOUT",
        note: expect.stringContaining("21px under the label's top, not 10px"),
      });
      // Centred without the margin, and against three lines.
      expect(checkboxWordsFault(desktop(12))?.code).toBe("CHECKBOX_WORDS_LAYOUT");
      expect(checkboxWordsFault(desktop(22, 60))?.code).toBe("CHECKBOX_WORDS_LAYOUT");
    });

    it("fails a box more than 0.5px off the first line's middle", () => {
      expect(checkboxWordsFault(desktop(3))?.code).toBe("CHECKBOX_WORDS_LAYOUT");
      expect(checkboxWordsFault(desktop(1))?.code).toBe("CHECKBOX_WORDS_LAYOUT");
    });

    it("fails words on one line, where a centred box sits on the first line too", () => {
      expect(checkboxWordsFault(desktop(2, 20))).toEqual({
        code: "CHECKBOX_WORDS_ONE_LINE",
        note: expect.stringContaining("20px high, under two lines of 20px"),
      });
    });

    it("fails a line height that isn't in pixels", () => {
      const unread = { ...desktop(2), lineHeight: Number.NaN };
      expect(checkboxWordsFault(unread)?.code).toBe("CHECKBOX_WORDS_UNREAD");
    });
  });

  describe("the checkbox card step", () => {
    it("passes where both surfaces draw the box on the first line, and reads it before ticking", async () => {
      const studio = checkboxStudio();
      await expect(cardCheckbox.run(studio.context)).resolves.toEqual({ passed: true });
    });

    it("fails the Inbox as CHECKBOX_WORDS_LAYOUT for a centred box, and still submits its picks", async () => {
      const studio = checkboxStudio();
      drawWrappingOption(studio, "Inbox", { boxTop: 13 });
      await expect(cardCheckbox.run(studio.context)).resolves.toMatchObject({
        code: "CHECKBOX_WORDS_LAYOUT",
        note: expect.stringMatching(/^Inbox: The box's middle is 21px/),
      });
      expect(
        studio.clicks.filter((each) => ["Email", "Blog", "Social", "Submit"].includes(each)),
      ).toEqual(["Email", "Blog", "Submit", "Social", "Submit"]);
    });

    it("fails the Messenger as CHECKBOX_WORDS_ONE_LINE where the words don't wrap", async () => {
      const studio = checkboxStudio();
      drawWrappingOption(studio, "Messenger", { labelHeight: 20 });
      await expect(cardCheckbox.run(studio.context)).resolves.toMatchObject({
        code: "CHECKBOX_WORDS_ONE_LINE",
        note: expect.stringMatching(/^Messenger: The words don't wrap/),
      });
    });

    it("fails as NO_OPTION where the card has no such option", async () => {
      const studio = checkboxStudio();
      drawWrappingOption(studio, "Inbox", { shown: false });
      await expect(cardCheckbox.run(studio.context)).resolves.toMatchObject({
        code: "NO_OPTION",
        note: expect.stringMatching(/^Inbox: No checkbox with the words "Everywhere/),
      });
    });

    it("keeps a failed click's own code over the look's", async () => {
      const studio = cardStudio(
        checkboxCard,
        submitting(["Email"], ["email"]),
        submitting(["Social"], ["social"]),
      );
      drawWrappingOption(studio, "Inbox", { boxTop: 13 });
      await expect(cardCheckbox.run(studio.context)).resolves.toMatchObject({
        code: "NO_OPTION",
        note: expect.stringMatching(/^Inbox: No .*'Blog'/),
      });
    });
  });
});
