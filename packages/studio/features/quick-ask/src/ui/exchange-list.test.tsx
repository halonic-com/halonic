// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ask, openBox } from "../test-support/box-page.tsx";
import { agent, chat, FakeMessenger } from "../test-support/fake-messenger.ts";
import { unmountAll } from "../test-support/render.tsx";

const chief = agent("Chief");

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

/**
 * jsdom has no layout, so every element sits at the top. This puts each question `questionTop`
 * px from the top of the page, as a scrolled list would, and everything else at 0.
 */
function placeQuestions(questionTop: number): void {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const top = this.matches("[data-question]") ? questionTop : 0;
    const rect = { x: 0, y: top, top, left: 0, width: 600, height: 40, right: 600 };
    return { ...rect, bottom: top + 40, toJSON: () => rect };
  });
}

/** The box with Chief's long answer to one question. */
async function answeredAtLength() {
  const messenger = new FakeMessenger([chat(chief)]);
  const { page } = await openBox(messenger);
  await ask(page, "Where are we with the release, and what is still open before Friday?");
  const longAnswer = Array.from({ length: 24 }, (_, line) => `Step ${line + 1}.`).join("\n\n");
  messenger.reply(chief, longAnswer, "2026-11-25T13:41:00.000Z");
  await act(async () => messenger.change("acme"));
  return page;
}

/** The list of exchanges, the one area of the box that scrolls. */
function scrollingList(page: HTMLElement): HTMLElement {
  const list = page.querySelector("ol");
  if (list === null) throw new Error("no exchanges");
  return list;
}

async function scroll(list: HTMLElement): Promise<void> {
  await act(async () => list.dispatchEvent(new Event("scroll")));
}

verifies("quick-ask.box", () => {
  describe("a long answer", () => {
    it("pins the question on one line, outside the scrolling list, once it scrolls above", async () => {
      const page = await answeredAtLength();
      const list = scrollingList(page);
      expect(page.querySelector("[data-pinned-question]")).toBeNull();

      placeQuestions(-120);
      await scroll(list);
      const pinned = page.querySelector("[data-pinned-question]");

      expect(pinned?.textContent).toBe(
        "Where are we with the release, and what is still open before Friday?",
      );
      expect(list.contains(pinned)).toBe(false);
      expect(list.className).toContain("overflow-y-auto");
      expect(pinned?.className).toContain("truncate");
      // Screen readers read the question once, in the list.
      expect(pinned?.closest("[aria-hidden='true']")).not.toBeNull();
    });

    it("unpins the question once it scrolls back into view", async () => {
      const page = await answeredAtLength();
      const list = scrollingList(page);
      placeQuestions(-120);
      await scroll(list);
      expect(page.querySelector("[data-pinned-question]")).not.toBeNull();

      placeQuestions(12);
      await scroll(list);
      expect(page.querySelector("[data-pinned-question]")).toBeNull();
    });

    it("scrolls only the list, with the fade outside it, so the answer's first line shows whole", async () => {
      const page = await answeredAtLength();
      const list = scrollingList(page);
      const answer = page.querySelector("[data-answer]");
      const fade = page.querySelector("[data-fade]");

      expect(answer?.className).not.toContain("overflow");
      expect(fade).not.toBeNull();
      expect(list.contains(fade)).toBe(false);
      expect(list.className).toContain("py-3");
      expect(fade?.className).toContain("h-3");
    });
  });
});
