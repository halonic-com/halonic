import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { button, type FakeStudio, fakeStudio } from "./fake-studio.test-helper.ts";
import { placesList } from "./screen.ts";
import { inboxAnswer } from "./steps/inbox-answer.ts";
import { agentPictureIn, messengerProbe, messengerSend } from "./steps/messenger-send.ts";
import { overviewRecap, searchTask } from "./steps/search-overview.ts";
import { disconnect, startMenuShortcuts } from "./steps/shortcuts-disconnect.ts";
import { seedNames } from "./test-paperclip.ts";
import { keys } from "./webdriver.ts";
import { buttonLabels, screenText, words } from "./words.ts";

function main(studio: FakeStudio) {
  const window = studio.windows.get("main");
  if (window === undefined) throw new Error("no main window");
  return window;
}

/** A connected Studio on a workspace, with the Places list holding `places`. */
function connectedStudio(places: Record<string, () => void>): FakeStudio {
  const studio = fakeStudio("Acme");
  button(studio, "main", screenText.places.text, () => {
    for (const [name, open] of Object.entries(places)) button(studio, "main", name, open);
  });
  return studio;
}

/** Opens a window named after each shortcut, showing `text`, the way the app does. */
function shortcutsOpen(studio: FakeStudio, texts: Record<string, string>) {
  Object.assign(studio.context, {
    openShortcut: async (name: string) => {
      studio.shortcuts.push(name);
      studio.windows.set(name, { text: texts[name] ?? "", buttons: new Map() });
    },
  });
}

verifies("studio-click-test.paperclip-steps", () => {
  describe("step 8, the Inbox card", () => {
    /**
     * A card whose Approve reaches the test Paperclip, or, with `reaches` false, doesn't. With
     * `staleLine`, the Inbox shows that line over it.
     */
    function studioWithCard(reaches = true, staleLine = ""): FakeStudio {
      const studio = connectedStudio({
        [screenText.inbox.text]: () => {
          main(studio).text = `Needs you ${screenText.strategyApproval.text}`;
          button(studio, "main", screenText.strategyApproval.text, () => {
            main(studio).text = `${staleLine}${screenText.strategyApproval.text} ${seedNames.card}`;
            button(studio, "main", buttonLabels.approve.text, () => {
              if (reaches) studio.paperclip.status = "approved";
              main(studio).text = `Needs you ${screenText.nothingWaiting.text} Done`;
            });
          });
        },
      });
      return studio;
    }

    it("opens the card, approves it and checks Paperclip has it approved", async () => {
      const studio = studioWithCard();
      await expect(inboxAnswer.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks.slice(-2)).toEqual([
        screenText.strategyApproval.text,
        buttonLabels.approve.text,
      ]);
    });

    it("fails as NOT_ANSWERED_ON_PAPERCLIP when the click never reached Paperclip", async () => {
      const studio = studioWithCard(false);
      await expect(inboxAnswer.run(studio.context)).resolves.toMatchObject({
        code: "NOT_ANSWERED_ON_PAPERCLIP",
        note: expect.stringContaining("Paperclip says pending."),
      });
    });

    it.each([
      screenText.engineShowingLast.text,
      screenText.staleInbox.text,
      screenText.agentLoadFailed.text,
    ])("fails as STALE_INBOX when the card shows under the line %s", async (line) => {
      const studio = studioWithCard(true, `${line} `);
      await expect(inboxAnswer.run(studio.context)).resolves.toMatchObject({
        code: "STALE_INBOX",
      });
    });

    it("fails as NO_CARD when the Inbox never shows it", async () => {
      const studio = connectedStudio({ [screenText.inbox.text]: () => undefined });
      await expect(inboxAnswer.run(studio.context)).resolves.toMatchObject({ code: "NO_CARD" });
    });
  });

  describe("step 9, a Messenger message", () => {
    /** A Messenger whose sent message reaches Paperclip, drawing the agent's picture `where`. */
    function studioSending(where: readonly (keyof typeof agentPictureIn)[]): FakeStudio {
      const studio = fakeStudio("Acme");
      shortcutsOpen(studio, { "Halonic Messenger": `${seedNames.agent} Chat` });
      Object.assign(studio.context.driver, {
        pressKeys: async () => {
          studio.paperclip.comments.push(studio.typed.join(""));
        },
      });
      for (const place of where) studio.elements.set(agentPictureIn[place], 1);
      return studio;
    }

    it("sends in the seeded chat, finds it on Paperclip and sees the agent's picture", async () => {
      const studio = studioSending(["chat row", "header"]);
      await expect(messengerSend.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.typed).toEqual([messengerProbe]);
    });

    it("fails as NO_AGENT_PICTURE when the Messenger shows only the agent's initial", async () => {
      const studio = studioSending([]);
      await expect(messengerSend.run(studio.context)).resolves.toEqual({
        passed: false,
        code: "NO_AGENT_PICTURE",
        note: `${seedNames.agent}'s chat row and header showed its initials, not its picture.`,
      });
      expect(studio.paperclip.comments).toEqual([messengerProbe]);
    });

    it("fails as NO_AGENT_PICTURE naming the header when only the row draws it", async () => {
      const studio = studioSending(["chat row"]);
      await expect(messengerSend.run(studio.context)).resolves.toMatchObject({
        code: "NO_AGENT_PICTURE",
        note: expect.stringContaining("header showed its initials"),
      });
    });

    it("fails as NOT_ON_PAPERCLIP when no comment arrives", async () => {
      const studio = fakeStudio("Acme");
      shortcutsOpen(studio, { "Halonic Messenger": seedNames.agent });
      Object.assign(studio.context.driver, { pressKeys: async () => undefined });
      await expect(messengerSend.run(studio.context)).resolves.toMatchObject({
        code: "NOT_ON_PAPERCLIP",
      });
    });

    it("fails as NO_CHAT when Messenger doesn't list the seeded chat", async () => {
      const studio = fakeStudio("Acme");
      shortcutsOpen(studio, { "Halonic Messenger": words.messengerEmpty.title });
      await expect(messengerSend.run(studio.context)).resolves.toMatchObject({ code: "NO_CHAT" });
    });
  });

  describe("steps 10 and 11, search and overview", () => {
    it("searches with Ctrl+K and opens the seeded task", async () => {
      const studio = fakeStudio("Acme");
      button(studio, "main", `${keys.control}+k`, () => {
        button(studio, "main", seedNames.task);
      });
      await expect(searchTask.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.typed).toEqual([seedNames.task]);
    });

    it("fails search as NOT_FOUND when no result holds the task", async () => {
      const studio = fakeStudio("Acme No results");
      button(studio, "main", `${keys.control}+k`);
      await expect(searchTask.run(studio.context)).resolves.toMatchObject({ code: "NOT_FOUND" });
    });

    it("passes when Overview shows the recap and the blocked list", async () => {
      const studio = connectedStudio({
        [screenText.overview.text]: () => {
          main(studio).text = `${screenText.recap.text} ${screenText.nothingBlocked.text}`;
        },
      });
      await expect(overviewRecap.run(studio.context)).resolves.toEqual({ passed: true });
    });

    it("opens Overview from the Places list when step 10 left Overview as the open tab", async () => {
      // Step 10's search lands on the Overview, so the closed "1 open tab" menu holds a hidden
      // Overview button before the Places list (runs 45736847707, 45740666285).
      const studio = connectedStudio({
        [screenText.overview.text]: () => {
          main(studio).text = `${screenText.recap.text} ${screenText.nothingBlocked.text}`;
        },
      });
      main(studio).text = `${screenText.overview.text} ${screenText.recap.text}`;
      studio.shownWithin.set(screenText.overview.text, placesList);
      await expect(overviewRecap.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks).toEqual([screenText.places.text, screenText.overview.text]);
    });

    it("fails as NO_OVERVIEW when Places has no Overview", async () => {
      const studio = connectedStudio({});
      await expect(overviewRecap.run(studio.context)).resolves.toMatchObject({
        code: "NO_OVERVIEW",
      });
    });
  });

  describe("step 12, the Start menu shortcuts", () => {
    it("needs a new Inbox window and the Messenger window with the chat", async () => {
      const studio = fakeStudio("Acme");
      studio.windows.set("messenger", { text: seedNames.agent, buttons: new Map() });
      shortcutsOpen(studio, { "Halonic Inbox": `Inbox ${screenText.nothingWaiting.text}` });
      await expect(startMenuShortcuts.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.shortcuts).toEqual(["Halonic Inbox", "Halonic Messenger"]);
    });

    it("doesn't take an Inbox window that was open before for the shortcut's", async () => {
      const studio = fakeStudio("Acme");
      studio.windows.set("old", {
        text: `Inbox ${screenText.nothingWaiting.text}`,
        buttons: new Map(),
      });
      await expect(startMenuShortcuts.run(studio.context)).resolves.toMatchObject({
        code: "NO_WINDOW",
      });
    });

    it("fails as NO_WINDOW when a shortcut opens nothing", async () => {
      const studio = fakeStudio("Acme");
      await expect(startMenuShortcuts.run(studio.context)).resolves.toMatchObject({
        code: "NO_WINDOW",
        note: expect.stringContaining("Halonic Inbox"),
      });
    });
  });

  describe("step 13, Disconnect", () => {
    function studioToDisconnect(revokes: boolean): FakeStudio {
      const studio = fakeStudio("Acme");
      button(studio, "main", buttonLabels.settings.text, () => {
        main(studio).text = `${words.connectionsSection} ${words.connected}`;
        button(studio, "main", words.disconnect, () => {
          // The dialog's button has the same label: the second click confirms.
          button(studio, "main", words.disconnect, () => {
            studio.paperclip.keyWorks = !revokes;
            main(studio).text = `Disconnected Paperclip · Acme. ${words.keyRevoked}`;
          });
        });
      });
      return studio;
    }

    it("confirms, sees the revoked line and checks Paperclip refuses the key", async () => {
      const studio = studioToDisconnect(true);
      await expect(disconnect.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks.slice(-2)).toEqual([words.disconnect, words.disconnect]);
    });

    it("fails as KEY_NOT_REVOKED when the key still works", async () => {
      await expect(disconnect.run(studioToDisconnect(false).context)).resolves.toMatchObject({
        code: "KEY_NOT_REVOKED",
        note: "Paperclip: the key still works.",
      });
    });
  });
});
