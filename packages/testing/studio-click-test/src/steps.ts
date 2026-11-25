import type { Step } from "./runner.ts";
import { connectPaperclip } from "./steps/connect-paperclip.ts";
import { engineAnswers } from "./steps/engine-answers.ts";
import { messengerEmpty } from "./steps/messenger-empty.ts";

/** The click test's steps, in the order a person takes them (HAL-17897's phase 1 list). */
export const clickTestSteps: readonly Step[] = [engineAnswers, messengerEmpty, connectPaperclip];
