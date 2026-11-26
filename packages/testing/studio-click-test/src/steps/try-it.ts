import type { Step, StepContext, StepOutcome } from "../runner.ts";
import { clickWhenShown, lastWords, pollEveryMs, waitForText } from "../screen.ts";
import { keys } from "../webdriver.ts";
import { buttonLabels, errorCodeIn, screenText } from "../words.ts";
import { probeMessage } from "./engine-answers.ts";
import { onWorkspaceWithoutSettings } from "./open-demo.ts";

/**
 * A key the key check holds (`findSecretShape`: `sk-` and 16 or more letters and digits), made
 * while the test runs, so the file holds no key-shaped text for the leak guard to find.
 */
export const fakeKey = ["sk", "ClickTest0Fake0Key0000"].join("-");
/** What the key step sends. */
export const keyMessage = `Click test: my key is ${fakeKey}`;

/** Writer's message box in its Try it chat. */
export const writerBox = `//textarea[@aria-label='${screenText.messageTo.text}${screenText.writer.text}']`;

/**
 * Step 14 (HAL-18869): Writer's Try it chat comes back. Runs after Close workspace and the
 * Settings steps, which open the demo again, then goes to the Agents list (an 800 px window folds
 * the tabs into a menu, so there's no tab to close; run 45705871308), opens Writer, and passes
 * once the chat shows step 1's message again, read from the saved chats.
 */
export const chatComesBack: Step = {
  id: "try-it-saved",
  title: "Writer's Try it chat comes back after leaving Writer's page",
  requirements: ["agents.chat.saved", "agents.chat.first-load"],
  needs: ["engine-answers"],
  run: async (context) => {
    const workspace = await onWorkspaceWithoutSettings(context);
    if (!workspace.passed) return workspace;
    if (!(await openAgents(context))) return await failure(context, "NO_AGENTS", "No Agents.");
    const left = await waitForText(context, 10_000, (text) =>
      text.includes(probeMessage) ? undefined : true,
    );
    if (left.value !== true) return await failure(context, "STILL_ON_WRITER", "");
    if (!(await openWriter(context))) return await failure(context, "NO_CHAT", "No Writer.");
    const back = await waitForText(context, 30_000, (text) =>
      text.includes(probeMessage) ? true : undefined,
    );
    if (back.value === true) return { passed: true };
    const code = errorCodeIn(back.text) ?? "NOT_SAVED";
    return { passed: false, code, note: `No "${probeMessage}". Screen: ${lastWords(back.text)}` };
  },
};

/**
 * Step 15 (HAL-18869): a Try it message that looks like it holds a key stays in the box with the
 * key line under it, and **Send anyway** sends it. The box's text isn't page text, so the key on
 * screen means the message was sent.
 */
export const keyHeld: Step = {
  id: "try-it-key",
  title: "A key in a Try it message is held until Send anyway",
  requirements: ["agents.chat.box-lines"],
  needs: ["engine-answers"],
  run: async (context) => {
    const workspace = await onWorkspaceWithoutSettings(context);
    if (!workspace.passed) return workspace;
    const onWriter =
      (await boxShown(context, 2_000)) ||
      ((await openAgents(context)) && (await openWriter(context)));
    if (!onWriter) return await failure(context, "NO_CHAT", "No Writer.");
    await context.driver.type(writerBox, keyMessage);
    await context.driver.pressKeys([keys.enter]);
    const { keyLine, sendAnyway } = screenText;
    const held = await waitForText(context, 15_000, (text) => {
      if (text.includes(fakeKey)) return "KEY_SENT";
      return text.includes(keyLine.text) ? "held" : undefined;
    });
    if (held.value !== "held") {
      const code = held.value ?? "NO_KEY_LINE";
      return { passed: false, code, note: `Screen: ${lastWords(held.text)}` };
    }
    if (!(await clickWhenShown(context, sendAnyway.text, 10_000))) {
      return { passed: false, code: "NO_SEND_ANYWAY", note: `Screen: ${lastWords(held.text)}` };
    }
    // Sending asks the trust check when the demo isn't trusted yet; no dialog is fine.
    await clickWhenShown(context, buttonLabels.trust.text, 5_000);
    const sent = await waitForText(context, 30_000, (text) =>
      text.includes(fakeKey) && !text.includes(keyLine.text) ? true : undefined,
    );
    if (sent.value === true) return { passed: true };
    const code = errorCodeIn(sent.text) ?? "NOT_SENT";
    return { passed: false, code, note: `Screen: ${lastWords(sent.text)}` };
  },
};

/**
 * Opens the Agents list: the agent page's back link is named Agents, as is the row in the Places
 * list, which the ☰ Places button opens and closes.
 */
async function openAgents(context: StepContext): Promise<boolean> {
  const { places, agents } = screenText;
  return (
    (await clickWhenShown(context, agents.text, 10_000)) ||
    ((await clickWhenShown(context, places.text, 10_000)) &&
      (await clickWhenShown(context, agents.text, 10_000)))
  );
}

/** Opens Writer from the Agents list and waits for its message box. */
async function openWriter(context: StepContext): Promise<boolean> {
  if (!(await clickWhenShown(context, screenText.writer.text, 30_000))) return false;
  return boxShown(context, 30_000);
}

/** Whether Writer's message box shows within `waitMs`; clicking it only puts focus in it. */
async function boxShown(context: StepContext, waitMs: number): Promise<boolean> {
  for (let waited = 0; ; waited += pollEveryMs) {
    const found = await context.driver.click(writerBox).then(
      () => true,
      () => false,
    );
    if (found || waited >= waitMs) return found;
    await context.sleep(pollEveryMs);
  }
}

async function failure(context: StepContext, code: string, note: string): Promise<StepOutcome> {
  const { text } = await waitForText(context, 0, () => undefined);
  const seen = `Screen: ${lastWords(text)}`;
  return { passed: false, code, note: note === "" ? seen : `${note} ${seen}` };
}
