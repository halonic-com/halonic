import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { button, drawStyles, type FakeStudio, fakeStudio } from "./fake-studio.test-helper.ts";
import { ownBubbleWith } from "./steps/conversation-look.ts";
import { probeMessage } from "./steps/engine-answers.ts";
import { chatComesBack, keyHeld, keyMessage, writerBox } from "./steps/try-it.ts";
import { clickTestSteps } from "./steps.ts";
import { keys } from "./webdriver.ts";
import { closeSettingsLabel, screenText } from "./words.ts";

const { agents, keyLine, places, sendAnyway, writer } = screenText;

function main(studio: FakeStudio) {
  const window = studio.windows.get("main");
  if (window === undefined) throw new Error("no main window");
  return window;
}

/** Shows Writer's chat with `text`: its message box, and the Agents back link. */
function showWriter(studio: FakeStudio, text: string, onAgents: () => void) {
  main(studio).text = `Writer ${text}`;
  button(studio, "main", writerBox);
  button(studio, "main", agents.text, onAgents);
}

/** Shows the Agents list, whose Writer row opens Writer's chat with `saved`. */
function showAgents(studio: FakeStudio, saved: string) {
  main(studio).text = "Agents Writer";
  main(studio).buttons.delete(writerBox);
  main(studio).buttons.delete(agents.text);
  button(studio, "main", writer.text, () => showWriter(studio, saved, () => undefined));
}

/** A workspace on Writer's chat after step 1; Writer opened again shows `saved`. */
function studioOnWriter(saved: string): FakeStudio {
  const studio = fakeStudio("");
  showWriter(studio, probeMessage, () => showAgents(studio, saved));
  drawStyles(studio, ownBubbleWith(probeMessage), {
    "border-top-left-radius": "7.5px",
    "background-color": "rgb(219, 231, 254)",
  });
  return studio;
}

/** Writer's chat, whose Enter holds a message with a key until Send anyway. */
function studioWithKeyCheck(onEnter: (studio: FakeStudio) => void): FakeStudio {
  const studio = fakeStudio("Acme");
  button(studio, "main", writerBox);
  button(studio, "main", keys.enter, () => onEnter(studio));
  return studio;
}

function holdsTheKey(studio: FakeStudio) {
  main(studio).text = `Acme ${keyLine.text}`;
  button(studio, "main", sendAnyway.text, () => {
    main(studio).text = `Acme ${keyMessage} Writer replied.`;
  });
}

verifies("studio-click-test.try-it-steps", () => {
  // Straight after them, as the requirement says; the places step (HAL-18870) may follow.
  it("come straight after the Settings steps reopened the demo", () => {
    const ids = clickTestSteps.map((step) => step.id);
    const lastSettings = ids.indexOf("settings-host-sections");
    expect(ids.slice(lastSettings, lastSettings + 3)).toEqual([
      "settings-host-sections",
      "try-it-saved",
      "try-it-key",
    ]);
  });

  describe("step 20, the chat comes back", () => {
    // Run 45712554139: the Settings a step before left open covered the window.
    it("closes a Settings left open first", async () => {
      const studio = studioOnWriter(probeMessage);
      button(studio, "main", closeSettingsLabel);
      await expect(chatComesBack.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks[0]).toBe(closeSettingsLabel);
    });

    it("goes back to Agents, opens Writer again and finds step 1's message", async () => {
      const studio = studioOnWriter(probeMessage);
      await expect(chatComesBack.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks).toEqual([agents.text, writer.text, writerBox]);
    });

    it("fails as NOT_SAVED when Writer opens on an empty chat", async () => {
      const outcome = await chatComesBack.run(studioOnWriter("Chat with Writer").context);
      expect(outcome).toMatchObject({ passed: false, code: "NOT_SAVED" });
    });

    it("fails as STILL_ON_WRITER when the chat stays on screen", async () => {
      const studio = studioOnWriter(probeMessage);
      button(studio, "main", agents.text);
      await expect(chatComesBack.run(studio.context)).resolves.toMatchObject({
        code: "STILL_ON_WRITER",
      });
    });

    it("opens Agents through Places when there's no back link", async () => {
      const studio = fakeStudio("Acme");
      button(studio, "main", places.text, () => {
        button(studio, "main", agents.text, () => showAgents(studio, "Chat with Writer"));
      });
      await expect(chatComesBack.run(studio.context)).resolves.toMatchObject({
        code: "NOT_SAVED",
      });
      expect(studio.clicks).toEqual([places.text, agents.text, writer.text, writerBox]);
    });

    it("needs step 1", () => {
      expect(chatComesBack.needs).toEqual(["engine-answers"]);
    });
  });

  describe("step 21, a key is held", () => {
    it("sees the key line with the key out of the chat, then Send anyway sends it", async () => {
      const studio = studioWithKeyCheck(holdsTheKey);
      await expect(keyHeld.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.typed).toEqual([keyMessage]);
      expect(studio.clicks).toEqual([writerBox, keys.enter, sendAnyway.text]);
    });

    it("fails as KEY_SENT when the message shows in the chat at once", async () => {
      const studio = studioWithKeyCheck((sent) => {
        main(sent).text = `Acme ${keyMessage}`;
      });
      await expect(keyHeld.run(studio.context)).resolves.toMatchObject({ code: "KEY_SENT" });
    });

    it("fails as NO_CHAT when Writer can't be opened", async () => {
      await expect(keyHeld.run(fakeStudio("Acme").context)).resolves.toMatchObject({
        code: "NO_CHAT",
      });
    });

    it("fails as NO_KEY_LINE when nothing happens", async () => {
      const studio = studioWithKeyCheck(() => undefined);
      await expect(keyHeld.run(studio.context)).resolves.toMatchObject({ code: "NO_KEY_LINE" });
    });

    it("fails as NOT_SENT when the line stays after Send anyway", async () => {
      const studio = studioWithKeyCheck((held) => {
        holdsTheKey(held);
        button(held, "main", sendAnyway.text);
      });
      await expect(keyHeld.run(studio.context)).resolves.toMatchObject({ code: "NOT_SENT" });
    });
  });
});

verifies("studio-click-test.conversation-look", () => {
  it("fails as BUBBLE_LOOK when step 1's message comes back with no bubble fill", async () => {
    const studio = studioOnWriter(probeMessage);
    studio.styles.set(`${ownBubbleWith(probeMessage)} background-color`, "rgba(0, 0, 0, 0)");
    await expect(chatComesBack.run(studio.context)).resolves.toEqual({
      passed: false,
      code: "BUBBLE_LOOK",
      note: "Your message's bubble has no fill.",
    });
  });
});
