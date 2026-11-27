import type { Step, StepContext, StepOutcome } from "../runner.ts";
import { clickOrWhyNot, clickWhenShown, lastWords, pollEveryMs, waitForText } from "../screen.ts";
import { keys } from "../webdriver.ts";
import { buttonLabels, errorCodeIn, screenText } from "../words.ts";
import { openDemo } from "./open-demo.ts";

/** How long the engine may take to answer the first message. */
const replyWaitMs = 90_000;
/** What step 1 sends. */
export const probeMessage = "Click test: are you there?";
/** Each Try it reply's hidden heading. */
const replyHeading = `${screenText.writer.text}${screenText.said.text}`;
/** Writer's reply while it is still being written. */
export const busyReply = `//*[@aria-busy='true'][contains(., '${replyHeading}')]`;

/**
 * Step 1 (Tomas, HAL-18317): the engine answers. Opens the demo from Welcome,
 * then the demo's Writer agent, whose Try it chat is open on its page, and
 * sends one message. The demo's mock model needs no key and answers with its
 * own canned line, not the message (run 45675354530), so the step passes once
 * the chat announces "Writer replied.", or shows Writer's reply after the message and
 * it has ended with no end line (HAL-20543), and fails on an engine line or a reply's end line. The desktop
 * Studio registers no Assistant panel (run 45654461077), so the Try it chat is
 * where a person meets "The engine isn't answering". The workspace shows before its engine
 * answers and the message waits for it, so once Writer replied, the line "Starting the engine…"
 * must be gone (HAL-19965).
 */
export const engineAnswers: Step = {
  id: "engine-answers",
  title: "The engine answers",
  requirements: [
    "shell.welcome-start",
    "shell.welcome-sample",
    "agents.chat.try-it",
    "agents.chat.engine-quiet",
    "studio.workspace-agents-chat",
    "studio.open-folder-before-engine",
    "shell.engine-starting",
  ],
  shortCheck: true,
  run: async (context) => {
    const opened = await openDemo(context);
    if (!opened.passed) return withShellLog(context, opened);
    const chat = await openWriterChat(context);
    if (!chat.passed) return withShellLog(context, chat);
    return withShellLog(context, await sendAndWaitForReply(context));
  },
};

async function openWriterChat(context: StepContext): Promise<StepOutcome> {
  const { places, agents, writer, chatWith } = screenText;
  for (const label of [places.text, agents.text, writer.text]) {
    const whyNot = await clickOrWhyNot(context, label, 30_000);
    if (whyNot !== undefined) {
      const { text } = await waitForText(context, 0, () => undefined);
      return failure("NO_CHAT", `Couldn't click ${label} (${whyNot}).`, text);
    }
  }
  const heading = `${chatWith.text}${writer.text}`;
  const chat = await waitForText(context, 30_000, (text) =>
    text.includes(heading) ? true : undefined,
  );
  if (chat.value === undefined) return failure("NO_CHAT", `No "${heading}".`, chat.text);
  return { passed: true };
}

async function sendAndWaitForReply(context: StepContext): Promise<StepOutcome> {
  const box = `//textarea[@aria-label='${screenText.messageTo.text}${screenText.writer.text}']`;
  const whyNot = await context.driver
    .type(box, probeMessage)
    .then(() => context.driver.pressKeys([keys.enter]))
    .then(
      () => undefined,
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
  if (whyNot !== undefined) return failure("NOT_SENT", `Couldn't send (${whyNot}).`, "");
  // Sending asks the trust check when the demo isn't trusted yet; no dialog is fine.
  await clickWhenShown(context, buttonLabels.trust.text, 5_000);
  let text = "";
  const reads = Math.ceil(replyWaitMs / pollEveryMs);
  for (let read = 0; read < reads; read += 1) {
    text = await context.driver.pageText().catch(() => "");
    const state = await replyState(context, text);
    if (state === "replied") return startingLineGone(context);
    if (state !== undefined) return failure(state, "", text);
    await context.sleep(pollEveryMs);
  }
  const note = replyAfterProbe(text) === undefined ? "No reply." : "Writer's reply never ended.";
  return failure("NO_REPLY", note, text);
}

/**
 * "replied" once Writer answered, an error line's code, or nothing while it's still answering.
 * "Writer replied." alone isn't enough: the window has one polite live region, and a later
 * announcement, such as "Halonic … is ready to install.", takes it before the next read
 * (HAL-20543). So a reply in the transcript that is no longer `aria-busy` counts too, but only one
 * with no end line, as "Writer replied." is announced only when Writer answered.
 */
async function replyState(context: StepContext, text: string): Promise<string | undefined> {
  const code = errorCodeIn(text);
  if (code !== undefined) return code;
  if (text.includes(`${screenText.writer.text}${screenText.replied.text}`)) return "replied";
  const reply = replyAfterProbe(text);
  if (reply === undefined) return undefined;
  if ((await context.driver.count(busyReply)) > 0) return undefined;
  if (reply.includes(screenText.stoppedByYou.text)) return "REPLY_STOPPED";
  if (reply.includes(screenText.turnLimit.text)) return "TURN_LIMIT";
  return "replied";
}

/** Writer's reply under its hidden heading, after the probe in the transcript, if it shows. */
function replyAfterProbe(text: string): string | undefined {
  const probeAt = text.lastIndexOf(probeMessage);
  if (probeAt === -1) return undefined;
  const headingAt = text.indexOf(replyHeading, probeAt);
  return headingAt === -1 ? undefined : text.slice(headingAt);
}

/** The engine answered, so the workspace's "Starting the engine…" line has gone. */
async function startingLineGone(context: StepContext): Promise<StepOutcome> {
  const starting = screenText.engineStarting.text;
  const gone = await waitForText(context, 10_000, (text) =>
    text.includes(starting) ? undefined : true,
  );
  if (gone.value === true) return { passed: true };
  return failure("STILL_STARTING", `"${starting}" stayed after the reply.`, gone.text);
}

function failure(code: string, note: string, text: string): StepOutcome {
  const seen = text === "" ? "" : `Screen: ${lastWords(text)}`;
  return { passed: false, code, note: [note, seen].filter((part) => part !== "").join(" ") };
}

async function withShellLog(context: StepContext, outcome: StepOutcome): Promise<StepOutcome> {
  if (outcome.passed) return outcome;
  const log = await context.shellLog();
  const page = await context.driver.describePage().catch((error: unknown) => String(error));
  return {
    ...outcome,
    note: `${outcome.note}\nPage: ${page}\nshell.log (engine, agent host):\n${log}`,
  };
}
