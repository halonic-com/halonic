// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AskMemory, memoryStorage } from "../ask-memory.ts";
import { byText, openBox, press, pressKey, textBox, typeIn } from "../test-support/box-page.tsx";
import { agent, chat, FakeMessenger } from "../test-support/fake-messenger.ts";
import { unmountAll } from "../test-support/render.tsx";

const chief = agent("Chief");
const liam = agent("Liam");
const noah = agent("Noah");
const elena = agent("Elena");

afterEach(unmountAll);

function picker(page: HTMLElement): HTMLInputElement {
  const search = page.querySelector<HTMLInputElement>("[data-agent-picker] input");
  if (search === null) throw new Error("the picker isn't open");
  return search;
}

verifies("quick-ask.box", () => {
  describe("the box", () => {
    it("is a dialog labelled Ask an agent, with the focus in the text box and the three keys", async () => {
      const { page } = await openBox(new FakeMessenger([chat(chief), chat(liam)]));
      const dialog = page.querySelector('[role="dialog"]');

      expect(dialog?.getAttribute("aria-label")).toBe("Ask an agent");
      expect(textBox(page).placeholder).toBe("Ask Chief anything");
      expect(document.activeElement).toBe(textBox(page));
      expect(page.querySelector('button[aria-label="Ask Chief. Change agent."]')).not.toBeNull();
      expect(page.querySelector('button[aria-label="Ask"]')).not.toBeNull();
      expect(page.querySelector("footer")?.textContent).toBe(
        "Enterask" + "Tabanother agent" + "Escclose",
      );
    });

    it("starts with the agent asked last and the text not sent", async () => {
      const storage = memoryStorage();
      const memory = new AskMemory(storage);
      memory.setLastAgent("chat-Liam");
      memory.setUnsent("Where are we with the release?");
      const { page } = await openBox(new FakeMessenger([chat(chief), chat(liam)]), storage);

      expect(textBox(page).placeholder).toBe("Ask Liam anything");
      expect(textBox(page).value).toBe("Where are we with the release?");
    });

    it("keeps a new line on Shift+Enter, and sends nothing for blank text", async () => {
      const messenger = new FakeMessenger([chat(chief)]);
      const { page } = await openBox(messenger);
      await typeIn(textBox(page), "   ");
      await pressKey(textBox(page), "Enter", true);
      await pressKey(textBox(page), "Enter");

      expect(messenger.messagesOf.size).toBe(0);
      expect(page.querySelector("[data-question]")).toBeNull();
    });
  });

  describe("the picker", () => {
    it("opens on Tab with Find an agent, Recent first, then each workspace and team", async () => {
      const globex = chat(elena);
      const team = {
        ...globex,
        source: globex.source && { ...globex.source, label: "Paperclip · Globex" },
      };
      const { page } = await openBox(
        new FakeMessenger([chat(chief), chat(liam), chat(noah), team]),
      );
      await pressKey(textBox(page), "Tab");

      expect(picker(page).placeholder).toBe("Find an agent");
      expect(document.activeElement).toBe(picker(page));
      const groups = [...page.querySelectorAll('[role="listbox"] [role="group"]')];
      expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
        "Recent",
        "Paperclip · Globex",
      ]);
      expect(page.querySelectorAll('[role="option"]')).toHaveLength(4);
    });

    it("finds an agent as the person types, and Enter picks it", async () => {
      const { page } = await openBox(new FakeMessenger([chat(chief), chat(liam), chat(elena)]));
      await press(page.querySelector('button[aria-label="Ask Chief. Change agent."]'));
      await typeIn(picker(page), "ele");

      const rows = [...page.querySelectorAll('[role="option"]')];
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain("Elena");
      await pressKey(picker(page), "Enter");
      expect(page.querySelector("[data-agent-picker]")).toBeNull();
      expect(textBox(page).placeholder).toBe("Ask Elena anything");
    });

    it("moves with the arrows and picks with a click", async () => {
      const { page } = await openBox(new FakeMessenger([chat(chief), chat(liam)]));
      await pressKey(textBox(page), "Tab");
      await pressKey(picker(page), "ArrowDown");
      const active = picker(page).getAttribute("aria-activedescendant");

      expect(page.querySelector(`[id="${active}"]`)?.textContent).toContain("Liam");
      await press(byText(page, '[role="option"]', "Liam"));
      expect(textBox(page).placeholder).toBe("Ask Liam anything");
    });

    it("closes only the picker on Esc, not the box", async () => {
      const { page, window } = await openBox(new FakeMessenger([chat(chief), chat(liam)]));
      await pressKey(textBox(page), "Tab");
      await pressKey(picker(page), "Escape");

      expect(page.querySelector("[data-agent-picker]")).toBeNull();
      expect(page.querySelector('[role="dialog"]')).not.toBeNull();
      expect(window.hidden).toBe(0);
    });
  });

  describe("closing", () => {
    it("hides the window on Esc", async () => {
      const { page, window, closed } = await openBox(new FakeMessenger([chat(chief)]));
      await pressKey(textBox(page), "Escape");

      expect(window.hidden).toBe(1);
      expect(closed).toHaveLength(1);
    });

    it("hides the window on a click beside the box, not on one in it", async () => {
      const { page, window } = await openBox(new FakeMessenger([chat(chief)]));
      const mouseDown = (element: Element | null) =>
        act(async () => {
          element?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        });
      await mouseDown(textBox(page));
      expect(window.hidden).toBe(0);

      await mouseDown(page.querySelector('[role="dialog"]')?.parentElement ?? null);
      expect(window.hidden).toBe(1);
    });
  });

  describe("no agents", () => {
    it("says No agents yet and brings Studio forward from Open Studio", async () => {
      const { page, window } = await openBox(new FakeMessenger([chat(liam, [liam, chief])]));

      expect(page.querySelector('[role="dialog"]')?.textContent).toContain("No agents yet");
      expect(page.textContent).toContain(
        "Connect a workspace or a team in Studio to ask its agents.",
      );
      expect(page.querySelector("textarea")).toBeNull();
      await press(byText(page, "button", "Open Studio"));
      expect(window.studioShown).toBe(1);
    });
  });
});
