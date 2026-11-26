import type { Step } from "../runner.ts";
import { clickRow, lastWords } from "../screen.ts";
import { seedNames } from "../test-paperclip.ts";
import { keys } from "../webdriver.ts";
import { words } from "../words.ts";
import { openAppWindow } from "./app-window.ts";
import { onWorkspace } from "./open-demo.ts";

/** What step 9 sends. */
export const messengerProbe = "Click test: hello from Messenger";

/**
 * Step 9: in Halonic Messenger, the seeded chat with Acme Clicky takes a
 * message, and the test Paperclip has it as a comment on that chat.
 */
export const messengerSend: Step = {
  id: "messenger-send",
  title: "Messenger: a message arrives as a comment on Paperclip",
  requirements: ["studio.focused-app-window", "messenger.chat-rows", "messenger.send-text"],
  needs: ["connect-paperclip"],
  run: async (context) => {
    // A restarted app is on Welcome, whose windows have no workspace and so no connection.
    const workspace = await onWorkspace(context);
    if (!workspace.passed) return workspace;
    // Step 2's window may still be open: the shortcut brings it back, and it must now list the
    // chat. WebDriver closing it instead left the shortcut with no window (run 45730163649).
    const window = await openAppWindow(context, "Halonic Messenger", (text) =>
      text.includes(seedNames.agent),
    );
    if (!window.opened) {
      return { passed: false, code: "NO_CHAT", note: `Messenger: ${lastWords(window.text)}` };
    }
    await clickRow(context, seedNames.agent, 10_000);
    const box = `//textarea[@aria-label='${words.messengerComposer(seedNames.agent)}']`;
    const typed = await context.driver.type(box, messengerProbe).then(
      () => true,
      () => false,
    );
    if (!typed) return { passed: false, code: "NO_COMPOSER", note: `No box ${box}.` };
    await context.driver.pressKeys([keys.enter]);
    for (let tries = 0; tries < 15; tries += 1) {
      const comments = await context.paperclip.chatComments();
      if (comments.some((body) => body.includes(messengerProbe))) return { passed: true };
      await context.sleep(2_000);
    }
    return {
      passed: false,
      code: "NOT_ON_PAPERCLIP",
      note: "The message never reached the chat on the test Paperclip.",
    };
  },
};
