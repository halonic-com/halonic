// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ask, openBox, pressKey, textBox, typeIn } from "../test-support/box-page.tsx";
import { agent, chat, FakeMessenger } from "../test-support/fake-messenger.ts";
import { unmountAll } from "../test-support/render.tsx";

const chief = agent("Chief");

afterEach(unmountAll);

/** An ISO time that is `hours:minutes` on the test machine's clock, as the box shows it. */
function localTime(hours: number, minutes: number): string {
  return new Date(2026, 10, 25, hours, minutes).toISOString();
}

function askButton(page: HTMLElement): HTMLButtonElement {
  const button = page.querySelector<HTMLButtonElement>('button[aria-label="Ask"]');
  if (button === null) throw new Error("the box has no Ask button");
  return button;
}

// The parts the design's stills draw (HAL-18594 section 4, Noah's visual pass; check HAL-19083).
verifies("quick-ask.box", () => {
  describe("the box's look", () => {
    it("names the picked agent on its chip, beside its picture", async () => {
      const { page } = await openBox(new FakeMessenger([chat(chief)]));
      const chip = page.querySelector('button[aria-label="Ask Chief. Change agent."]');

      expect(chip?.textContent).toBe("CChief");
    });

    // Quiet is the kit's soft round button since the prompt look (HAL-19756).
    it("keeps Ask quiet while the box is empty, and makes it primary once there's text", async () => {
      const { page } = await openBox(new FakeMessenger([chat(chief)]));

      expect(askButton(page).className).toContain("bg-surface-soft");
      expect(askButton(page).className).not.toContain("bg-primary");
      await typeIn(textBox(page), "Where are we?");
      expect(askButton(page).className).toContain("bg-primary");
      await typeIn(textBox(page), "  ");
      expect(askButton(page).className).toContain("bg-surface-soft");
    });

    it("shows each agent's role after its name and what it's doing on the right", async () => {
      const liam = { ...agent("Liam", "working"), title: "CTO" };
      const { page } = await openBox(new FakeMessenger([chat(chief), chat(liam)]));
      await pressKey(textBox(page), "Tab");
      const rows = [...page.querySelectorAll('[role="option"]')].map((row) => row.textContent);

      expect(rows).toEqual(["CChiefIdle", "LLiam · CTOWorking"]);
    });

    it("gives the question its time, and the answer the agent's name and time", async () => {
      const messenger = new FakeMessenger([chat(chief)]);
      messenger.sentAt = localTime(14, 2);
      const { page } = await openBox(messenger);
      await ask(page, "Where are we?");
      messenger.reply(chief, "The notes are done.", localTime(14, 6));
      messenger.reply(chief, "Mateo is checking the installer.", localTime(14, 7));
      await act(async () => messenger.change("acme"));

      expect(page.querySelector("[data-question-time]")?.textContent).toBe("14:02");
      expect(page.querySelector("[data-answer-author]")?.textContent).toBe("Chief · 14:06");
      const heading = page.querySelector('[data-chat-message="reply"] h2');
      expect(heading?.textContent).toBe("Chief · 14:06");
    });
  });
});
