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

afterEach(() => document.documentElement.removeAttribute("data-theme"));

// The new design's panel and message box (HAL-20746).
verifies("quick-ask.box-look", () => {
  describe("the box on the new parts", () => {
    it("draws the box on the panel corner with the dialogs' shadow, in light and dark", async () => {
      for (const theme of ["light", "dark"]) {
        document.documentElement.setAttribute("data-theme", theme);
        const { page } = await openBox(new FakeMessenger([chat(chief)]));
        const classes = page.querySelector('[role="dialog"]')?.className.split(" ") ?? [];

        expect(classes, theme).toEqual(
          expect.arrayContaining(["rounded-panel", "bg-surface-raised", "shadow-3"]),
        );
        expect(classes, theme).not.toContain("border");
        unmountAll();
      }
    });

    // Light keeps the shadow's own edge; dark draws the prompt boxes' edge as a ring (HAL-20825).
    it("rings the box in the prompt boxes' edge colour in dark only, keeping its corner", async () => {
      const { page } = await openBox(new FakeMessenger([chat(chief)]));
      const classes = page.querySelector('[role="dialog"]')?.className.split(" ") ?? [];

      expect(classes).toEqual(
        expect.arrayContaining([
          "rounded-panel",
          "ring-1",
          "ring-[color:light-dark(transparent,var(--color-border-prompt))]",
        ]),
      );
    });

    it("puts the question in the kit's message box, with the chip and Ask inside and the focus in the text", async () => {
      const { page } = await openBox(new FakeMessenger([chat(chief)]));
      const messageBox = textBox(page).closest(".rounded-composer");

      expect(messageBox).toBeInstanceOf(HTMLElement);
      expect(messageBox?.className).toContain("shadow-composer");
      expect(
        messageBox?.querySelector('button[aria-label="Ask Chief. Change agent."]'),
      ).not.toBeNull();
      expect(messageBox?.contains(askButton(page))).toBe(true);
      expect(document.activeElement).toBe(textBox(page));
    });

    // The chip is drawn first only because the kit puts `trailing` straight into the message
    // box's flex row and `leading={null}` leaves its start padding off (Nora on #6888).
    it("draws the agent chip before the text, straight in the message box's row", async () => {
      const { page } = await openBox(new FakeMessenger([chat(chief)]));
      const messageBox = textBox(page).closest(".rounded-composer");
      const chip = page.querySelector('button[aria-label="Ask Chief. Change agent."]');

      expect(chip?.parentElement).toBe(messageBox);
      expect(chip?.classList.contains("order-first")).toBe(true);
      expect(messageBox?.classList.contains("ps-4")).toBe(false);
    });

    it("keeps the chip by a long question's first line and Ask by its last", async () => {
      const { page } = await openBox(new FakeMessenger([chat(chief)]));
      await typeIn(textBox(page), "Where are we?\nAnd what's next?\nWho checks it?");
      const chip = page.querySelector('button[aria-label="Ask Chief. Change agent."]');

      expect(chip?.classList.contains("self-start")).toBe(true);
      expect(chip?.classList.contains("mt-0.5")).toBe(true);
      expect(askButton(page).classList.contains("self-start")).toBe(false);
    });
  });
});

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
