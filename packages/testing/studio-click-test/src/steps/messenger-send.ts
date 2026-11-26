import type { Step, StepContext, StepOutcome } from "../runner.ts";
import { clickRow, lastWords, pollEveryMs } from "../screen.ts";
import { seedNames } from "../test-paperclip.ts";
import { keys } from "../webdriver.ts";
import { words } from "../words.ts";
import { openAppWindow } from "./app-window.ts";
import { onWorkspace } from "./open-demo.ts";

/** What step 9 sends. */
export const messengerProbe = "Click test: hello from Messenger";

/** A kit Avatar whose picture is drawn says so; the initials never do (`kit.avatar-picture`). */
const drawnPicture = "//*[@data-picture='drawn']";

/** Where step 9 looks for the seeded agent's picture: its chat row and the open chat's header. */
export const agentPictureIn = {
  "chat row": `//button[@data-chat][contains(normalize-space(), '${seedNames.agent}')]${drawnPicture}`,
  header: `//header[.//h2[contains(normalize-space(), '${seedNames.agent}')]]${drawnPicture}`,
} as const;

/** How long the Messenger gets to read and draw a picture once its place shows. */
const pictureWaitMs = 10_000;

/**
 * Step 9: in Halonic Messenger, the seeded chat with Acme Clicky takes a
 * message, and the test Paperclip has it as a comment on that chat. The
 * chat's row and its header show Acme Clicky's picture, which Paperclip gives
 * every agent, not its initials (HAL-19151).
 */
export const messengerSend: Step = {
  id: "messenger-send",
  title: "Messenger: a message arrives as a comment on Paperclip",
  requirements: [
    "studio.focused-app-window",
    "messenger.chat-rows",
    "messenger.send-text",
    "messenger.agent-pictures",
    "kit.avatar-picture",
  ],
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
    // The row is read before the click: a narrow window shows only the open chat after it.
    const rowPicture = await pictureShows(context, agentPictureIn["chat row"]);
    await clickRow(context, seedNames.agent, 10_000);
    const sent = await sendProbe(context);
    if (!sent.passed) return sent;
    const headerPicture = await pictureShows(context, agentPictureIn.header);
    const missing = [rowPicture ? [] : ["chat row"], headerPicture ? [] : ["header"]].flat();
    if (missing.length === 0) return { passed: true };
    return {
      passed: false,
      code: "NO_AGENT_PICTURE",
      note: `${seedNames.agent}'s ${missing.join(" and ")} showed its initials, not its picture.`,
    };
  },
};

/** Types the probe in the open chat, sends it, and waits for it as a comment on Paperclip. */
async function sendProbe(context: StepContext): Promise<StepOutcome> {
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
}

/** Whether a drawn picture shows at `xpath` within {@link pictureWaitMs}. */
async function pictureShows(context: StepContext, xpath: string): Promise<boolean> {
  for (let waited = 0; waited <= pictureWaitMs; waited += pollEveryMs) {
    if ((await context.driver.count(xpath)) > 0) return true;
    await context.sleep(pollEveryMs);
  }
  return false;
}
