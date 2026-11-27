import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { button, type FakeStudio, fakeStudio } from "./fake-studio.test-helper.ts";
import { connectPaperclip } from "./steps/connect-paperclip.ts";
import { busyReply, engineAnswers, probeMessage } from "./steps/engine-answers.ts";
import { messengerEmpty } from "./steps/messenger-empty.ts";
import { keys } from "./webdriver.ts";
import { buttonLabels, screenText, words } from "./words.ts";

function main(studio: FakeStudio) {
  const window = studio.windows.get("main");
  if (window === undefined) throw new Error("no main window");
  return window;
}

/** A Studio whose demo opens, with Writer's chat, which shows `reply` after a message. */
function studioWithChat(reply: string): FakeStudio {
  const studio = fakeStudio("Halonic Studio");
  const { places, agents, writer, chatWith } = screenText;
  button(studio, "main", buttonLabels.openDemo.text, () => {
    main(studio).text = "Acme";
    button(studio, "main", places.text, () => {
      button(studio, "main", agents.text, () => {
        button(studio, "main", writer.text, () => {
          main(studio).text = `${chatWith.text}${writer.text}`;
          button(studio, "main", keys.enter, () => {
            main(studio).text = `${chatWith.text}${writer.text} ${probeMessage} ${reply}`;
          });
        });
      });
    });
  });
  return studio;
}

/**
 * Runs step 1 on a chat whose reply to the probe shows busy. On the first wait after the step
 * asked whether it's busy, `then` adds its text to the reply and sets whether it's still busy;
 * with no `then` the reply stays busy. With `inBusyCheck`, it ends inside that first check
 * instead, after the step read the page and before the check answers.
 */
async function replyThatEnds(
  then: { text: string; busy: boolean; inBusyCheck?: boolean } | undefined,
) {
  const studio = studioWithChat(`${screenText.writer.text}${screenText.said.text} Sam wants a`);
  studio.elements.set(busyReply, 1);
  let askedBusy = false;
  const end = () => {
    if (then === undefined) return;
    main(studio).text = `${main(studio).text} ${then.text}`;
    studio.elements.set(busyReply, then.busy ? 1 : 0);
  };
  const { driver } = studio.context;
  return engineAnswers.run({
    ...studio.context,
    driver: {
      ...driver,
      count: async (xpath) => {
        if (xpath === busyReply && !askedBusy && then?.inBusyCheck === true) end();
        askedBusy ||= xpath === busyReply;
        return driver.count(xpath);
      },
    },
    sleep: async () => {
      if (askedBusy && then?.inBusyCheck !== true) end();
    },
  });
}

verifies("studio-click-test.steps", () => {
  describe("step 1, the engine answers", () => {
    // Run 45675354530: the demo's mock model answers with its own line, not an echo.
    it("sends Writer a message and passes once the chat says Writer replied", async () => {
      const { writer, replied } = screenText;
      const studio = studioWithChat(`Sam wants a refund. ${writer.text}${replied.text}`);
      await expect(engineAnswers.run(studio.context)).resolves.toEqual({ passed: true });
      const { places, agents } = screenText;
      expect(studio.clicks).toEqual([
        buttonLabels.openDemo.text,
        places.text,
        agents.text,
        writer.text,
        keys.enter,
      ]);
      expect(studio.typed).toEqual([probeMessage]);
    });

    // Runs 45965592082 and 45966738840: the reply showed, but the updater's announcement had taken
    // the one polite live region from "Writer replied." before the next read (HAL-20543).
    it("passes on Writer's ended reply when a later announcement took the live region", async () => {
      const { writer, said } = screenText;
      const announcement = "Halonic 0.1.2-preview.446 is ready to install. Restart to update.";
      const studio = studioWithChat(
        `${writer.text}${said.text} Sam wants a refund. ${announcement}`,
      );
      await expect(engineAnswers.run(studio.context)).resolves.toEqual({ passed: true });
    });

    it("fails as NO_REPLY, with the screen, while Writer's reply is still being written", async () => {
      const outcome = await replyThatEnds(undefined);
      expect(outcome).toMatchObject({ passed: false, code: "NO_REPLY" });
      expect(outcome.passed ? "" : outcome.note).toContain("Writer's reply never ended.");
      expect(outcome.passed ? "" : outcome.note).toContain("Screen: ");
    });

    // "Writer replied." is announced only when Writer answered, so its reply passes only then.
    it.each([
      ["REPLY_FAILED", `${screenText.writer.text}${screenText.replyFailed.text}no model.`],
      [
        "TURN_LIMIT",
        `${screenText.writer.text} used all 8 model calls${screenText.turnLimit.text}`,
      ],
      ["REPLY_STOPPED", screenText.stoppedByYou.text],
    ])("fails as %s when Writer's busy reply ends on that line", async (code, endLine) => {
      const outcome = await replyThatEnds({ text: `refund. ${endLine}`, busy: false });
      expect(outcome).toMatchObject({ passed: false, code });
    });

    // Review round 2: a reply that ends between the step's read and its busy check must be judged
    // on a read taken after the check, which holds the end line.
    it("fails as TURN_LIMIT when Writer's reply ends between the read and the busy check", async () => {
      const turnLimit = `${screenText.writer.text} used all 8 model calls${screenText.turnLimit.text}`;
      const outcome = await replyThatEnds({ text: turnLimit, busy: false, inBusyCheck: true });
      expect(outcome).toMatchObject({ passed: false, code: "TURN_LIMIT" });
    });

    it("fails as ENGINE_NOT_ANSWERING as soon as that line shows while Writer's reply is busy", async () => {
      const outcome = await replyThatEnds({ text: words.engineNotAnswering, busy: true });
      expect(outcome).toMatchObject({ passed: false, code: "ENGINE_NOT_ANSWERING" });
      expect(outcome.passed ? "" : outcome.note).toContain(`Screen: `);
    });

    it("fails with the engine line's code, the page and the shell log's lines", async () => {
      const studio = studioWithChat(words.engineNotAnswering);
      const outcome = await engineAnswers.run(studio.context);
      expect(outcome).toMatchObject({ passed: false, code: "ENGINE_NOT_ANSWERING" });
      expect(outcome.passed ? "" : outcome.note).toContain("crashed 3 times in 5 minutes");
      expect(outcome.passed ? "" : outcome.note).toContain(
        `Page: buttons [${buttonLabels.openDemo.text} | ${screenText.places.text}`,
      );
    });

    it('fails as STILL_STARTING when "Starting the engine…" stays after the reply', async () => {
      const { writer, replied, engineStarting } = screenText;
      const studio = studioWithChat(`${engineStarting.text} ${writer.text}${replied.text}`);
      const outcome = await engineAnswers.run(studio.context);
      expect(outcome).toMatchObject({ passed: false, code: "STILL_STARTING" });
    });

    it("fails as NO_REPLY when nothing comes back, even an echo of the message", async () => {
      const outcome = await engineAnswers.run(studioWithChat(probeMessage).context);
      expect(outcome).toMatchObject({ passed: false, code: "NO_REPLY" });
    });

    it("fails as NO_CHAT when Writer isn't in Agents", async () => {
      const studio = fakeStudio("Halonic Studio");
      button(studio, "main", buttonLabels.openDemo.text);
      const outcome = await engineAnswers.run(studio.context);
      expect(outcome).toMatchObject({ passed: false, code: "NO_CHAT" });
      expect(outcome.passed ? "" : outcome.note).toContain(
        `Couldn't click ${screenText.places.text}`,
      );
    });

    it("fails as ENGINE_NOT_STARTED when Open demo never turns on", async () => {
      const outcome = await engineAnswers.run(fakeStudio("Starting Halonic…").context);
      expect(outcome).toMatchObject({ passed: false, code: "ENGINE_NOT_STARTED" });
      expect(outcome.passed ? "" : outcome.note).toContain(
        "last click: no such element: Open demo",
      );
    });
  });

  describe("step 2, Messenger's empty state", () => {
    function studioWithMessenger(text: string, connections: string): FakeStudio {
      const studio = fakeStudio("Acme");
      const openMessenger = studio.context.openShortcut;
      Object.assign(studio.context, {
        openShortcut: async (name: string) => {
          await openMessenger(name);
          studio.windows.set("messenger", { text, buttons: new Map() });
        },
      });
      // As in the app: Settings is a row in the list the Places button opens.
      button(studio, "main", screenText.places.text, () => {
        button(studio, "main", buttonLabels.settings.text, () => {
          button(studio, "main", words.connectionsSection, () => {
            main(studio).text = connections;
          });
        });
      });
      return studio;
    }

    it("passes on No connections, opened from the Start menu shortcut", async () => {
      const { title, line } = words.messengerEmpty;
      const studio = studioWithMessenger(`${title} ${line}`, "");
      await expect(messengerEmpty.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.shortcuts).toEqual(["Halonic Messenger"]);
    });

    it("fails a blank Messenger with the error Settings › Connections shows", async () => {
      const studio = studioWithMessenger("", words.listFailed);
      const outcome = await messengerEmpty.run(studio.context);
      expect(outcome).toMatchObject({
        passed: false,
        code: "LIST_FAILED",
        note: "Messenger: (blank)",
      });
      expect(studio.clicks).toEqual([
        screenText.places.text,
        buttonLabels.settings.text,
        words.connectionsSection,
      ]);
    });

    it("fails as NO_WINDOW when the shortcut opens nothing", async () => {
      const studio = fakeStudio("Acme");
      await expect(messengerEmpty.run(studio.context)).resolves.toMatchObject({
        code: "NO_WINDOW",
      });
    });
  });

  describe("step 3, Connect Paperclip", () => {
    function studioToConnect(): FakeStudio {
      const studio = fakeStudio("Acme");
      button(studio, "main", buttonLabels.settings.text, () => {
        main(studio).text = `${words.connectionsSection} ${words.connect}`;
        button(studio, "main", words.connect, () => {
          button(studio, "main", words.continueLabel, () => {
            main(studio).text = studio.approval === undefined ? words.connected : "Waiting";
          });
        });
      });
      return studio;
    }

    it("types the test Paperclip's address, approves and sees Connected", async () => {
      const studio = studioToConnect();
      await expect(connectPaperclip.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.typed).toEqual(["http://127.0.0.1:3199"]);
    });

    it("opens the demo again first when a restarted app is on Welcome", async () => {
      const studio = studioToConnect();
      const workspace = main(studio).text;
      main(studio).text = `Welcome ${buttonLabels.openDemo.text}`;
      button(studio, "main", buttonLabels.openDemo.text, () => {
        main(studio).text = workspace;
      });
      await expect(connectPaperclip.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks[0]).toBe(buttonLabels.openDemo.text);
    });

    it("fails as NOT_APPROVED when the board couldn't approve", async () => {
      const studio = studioToConnect();
      studio.approval = "Studio started no sign-in on the test Paperclip.";
      await expect(connectPaperclip.run(studio.context)).resolves.toMatchObject({
        code: "NOT_APPROVED",
      });
    });

    it("fails as NO_SETTINGS when neither Settings nor Places is there", async () => {
      await expect(connectPaperclip.run(fakeStudio("Acme").context)).resolves.toMatchObject({
        code: "NO_SETTINGS",
      });
    });

    it("fails with LIST_FAILED when Connections can't list", async () => {
      const studio = fakeStudio(words.listFailed);
      await expect(connectPaperclip.run(studio.context)).resolves.toMatchObject({
        code: "LIST_FAILED",
      });
    });
  });
});
