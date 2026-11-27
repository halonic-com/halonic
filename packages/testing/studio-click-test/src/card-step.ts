import { type CardFixture, promptOn, type Surface, surfaces } from "./card-fixtures.ts";
import type { CardRecord, CardRef } from "./card-seed.ts";
import { messengerWindowLabel } from "./main-window.ts";
import type { Step, StepContext, StepOutcome } from "./runner.ts";
import { clickRow, clickWhenShown, lastWords, waitForText, xpathString } from "./screen.ts";
import { openAppWindow } from "./steps/app-window.ts";
import { closeDialogs, onWorkspace, openPlace } from "./steps/open-demo.ts";
import { seedNames } from "./test-paperclip.ts";
import { screenText } from "./words.ts";

/**
 * How long a surface gets to show a newly seeded card. In the click test the host gets no live
 * events: the board proxy (`paperclip-board.ts`) forwards with `fetch`, which can't pass the
 * events socket's upgrade, and the stock Paperclip turns board keys away there too. So the host
 * only polls, every 2 minutes while no Studio window reports focus (`pollRates.down` in
 * `@halonicjs/host-paperclip-sync`; all windows share one focus flag), as after step 13 opens
 * the focused apps' windows. The wait covers one such poll and a margin.
 */
const cardWaitMs = 150_000;
/** How many times, 2 s apart, Paperclip is read for an answer the surface sent. */
const answerPolls = 15;
/** How long an open card's Back to Inbox gets to show; without an open card there's none. */
const backWaitMs = 2_000;

/**
 * What a card step clicks on one surface once its copy shows: `card` is an XPath for that copy,
 * the Inbox's open card or the Messenger's card in the chat. It fails with the code of the click
 * that didn't happen.
 */
export type AnswerClicks = (context: StepContext, card: string) => Promise<StepOutcome>;

/** What Paperclip must have once a copy is answered: undefined when it does, else what differs. */
export type AnswerCheck = (record: CardRecord) => string | undefined;

/** One card kind's step: its fixture, and per surface what it clicks and what Paperclip then has. */
export interface CardStepSpec {
  readonly id: string;
  readonly title: string;
  readonly requirements: readonly string[];
  readonly fixture: CardFixture;
  readonly clicks: Readonly<Record<Surface, AnswerClicks>>;
  readonly answered: Readonly<Record<Surface, AnswerCheck>>;
}

/**
 * A card step (HAL-19002): it seeds the kind's two copies, answers the Inbox's in the main
 * window and the Messenger's in the seeded agent's chat, and after each answer reads the copy
 * back through the test Paperclip's API. Its own seed keeps the cards out of the Inbox until the
 * steps that want it empty are done. A failure names the surface it happened on.
 */
export function cardStep(spec: CardStepSpec): Step {
  return {
    id: spec.id,
    title: spec.title,
    requirements: spec.requirements,
    needs: ["connect-paperclip"],
    run: async (context) => {
      const seeded = await context.paperclip.seedCard(spec.fixture).then(
        (cards) => cards,
        (error: unknown) => String(error),
      );
      if (typeof seeded === "string") return { passed: false, code: "NOT_SEEDED", note: seeded };
      // Both surfaces are tried even when the first fails: a chat holds one open yes/no card, so
      // one left unanswered here would be expired by the next step's seed, and the Messenger's
      // own result would be lost.
      const failures: { code: string; note: string }[] = [];
      for (const surface of surfaces) {
        const outcome = await answerOn(context, spec, surface, seeded[surface]);
        if (!outcome.passed)
          failures.push({ code: outcome.code, note: `${surface}: ${outcome.note}` });
      }
      const [first] = failures;
      if (first === undefined) return { passed: true };
      return { passed: false, code: first.code, note: failures.map((each) => each.note).join(" ") };
    },
  };
}

/** Opens one surface's copy, clicks its answer, and checks Paperclip has that answer. */
async function answerOn(
  context: StepContext,
  spec: CardStepSpec,
  surface: Surface,
  ref: CardRef,
): Promise<StepOutcome> {
  const prompt = promptOn(spec.fixture, surface);
  const shown =
    surface === "Inbox" ? await openInInbox(context, prompt) : await openInChat(context);
  if (!shown.passed) return shown;
  const card = await waitForText(context, cardWaitMs, (text) =>
    text.includes(prompt) ? true : undefined,
  );
  if (card.value !== true) return { passed: false, code: "NO_CARD", note: lastWords(card.text) };
  const clicked = await spec.clicks[surface](context, cardHolding(surface, prompt));
  if (!clicked.passed) return clicked;
  return answerOnPaperclip(context, ref, spec.answered[surface]);
}

/**
 * The main window's Inbox, with the copy's row clicked open. The card step before can leave its
 * answered card open, and in the 800 px window that card hides the list, so the step goes back to
 * the list first, as step 9 does (run 46006509779).
 */
async function openInInbox(context: StepContext, prompt: string): Promise<StepOutcome> {
  const workspace = await onWorkspace(context);
  if (!workspace.passed) return workspace;
  await closeDialogs(context);
  if (!(await openPlace(context, screenText.inbox.text))) {
    return { passed: false, code: "NO_INBOX", note: "No Inbox in Places." };
  }
  await clickWhenShown(context, screenText.backToInbox.text, backWaitMs);
  if (await clickRow(context, prompt, cardWaitMs)) return { passed: true };
  const { text } = await waitForText(context, 0, () => undefined);
  // The shell log has the engine's lines up to the failure, for whoever looks into it next.
  const log = await context.shellLog();
  return { passed: false, code: "NO_ROW", note: `${lastWords(text)}\nshell.log:\n${log}` };
}

/**
 * Halonic Messenger, with the seeded agent's chat open. Its window is found by its label: the
 * Inbox window step 13 left open names the agent too, once a card of its is waiting (run
 * 46000541525).
 */
async function openInChat(context: StepContext): Promise<StepOutcome> {
  const window = await openAppWindow(
    context,
    "Halonic Messenger",
    (text, label) => label === messengerWindowLabel && text.includes(seedNames.agent),
  );
  if (!window.opened) return { passed: false, code: "NO_CHAT", note: lastWords(window.text) };
  await clickRow(context, seedNames.agent, 10_000);
  return { passed: true };
}

/**
 * An XPath for the copy that holds `prompt`: the Inbox's open card is a `section`, a chat's card
 * an `article` (`messenger.inline-cards`).
 */
export function cardHolding(surface: Surface, prompt: string): string {
  const element = surface === "Inbox" ? "section" : "article";
  return `//${element}[contains(string(), ${xpathString(prompt)})]`;
}

/** Waits for Paperclip to have the copy answered, then checks it has the answer clicked. */
async function answerOnPaperclip(
  context: StepContext,
  ref: CardRef,
  check: AnswerCheck,
): Promise<StepOutcome> {
  let record = await context.paperclip.card(ref);
  for (let poll = 1; poll < answerPolls && record.status === "pending"; poll += 1) {
    await context.sleep(2_000);
    record = await context.paperclip.card(ref);
  }
  if (record.status === "pending") {
    const note = "Paperclip still has the card pending.";
    return { passed: false, code: "NOT_ANSWERED_ON_PAPERCLIP", note };
  }
  const differs = check(record);
  if (differs === undefined) return { passed: true };
  return { passed: false, code: "WRONG_ANSWER", note: differs };
}

/**
 * A check that Paperclip has the copy in `status`, with `result` holding `fields`. Only what
 * `fields` names counts: Paperclip adds its own, such as when each item verdict was given.
 */
export function answeredAs(
  status: string,
  fields: Readonly<Record<string, unknown>> = {},
): AnswerCheck {
  return (record) => {
    const found = { status: record.status, ...asObject(record.result) };
    if (holds(found, { status, ...fields })) return undefined;
    return `Paperclip has ${JSON.stringify(found)}, not ${JSON.stringify({ status, ...fields })}.`;
  };
}

function asObject(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null ? { ...value } : {};
}

/**
 * Whether `found` holds `wanted`: an object every field `wanted` names, a list one element for
 * each of `wanted`'s in any order (Paperclip doesn't promise one), anything else the same value.
 */
export function holds(found: unknown, wanted: unknown): boolean {
  if (Array.isArray(wanted)) {
    if (!Array.isArray(found) || found.length !== wanted.length) return false;
    const left = [...found];
    return wanted.every((each) => {
      const at = left.findIndex((candidate) => holds(candidate, each));
      return at >= 0 && left.splice(at, 1).length === 1;
    });
  }
  if (typeof wanted === "object" && wanted !== null) {
    if (typeof found !== "object" || found === null) return false;
    return Object.entries(wanted).every(([key, value]) => holds(Reflect.get(found, key), value));
  }
  return Object.is(found, wanted);
}
