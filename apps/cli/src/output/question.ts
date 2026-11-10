import type { Message } from "../messages/define.ts";
import { questionMessages } from "../messages/question.ts";
import { type Environment, runsInCi } from "./style.ts";

/** What decides whether the command may ask the user something. */
export interface AskInputs {
  /** The process's environment, for `CI`. */
  readonly env: Environment;
  /** Whether stdin is a terminal, so someone is there to answer. */
  readonly stdinIsTerminal: boolean;
  /** Whether `--json` was given: a script reads the output, and never answers. */
  readonly json: boolean;
}

/**
 * Whether a question may be asked (cli-output 1.7 and 1.8): only when stdin
 * is a terminal, `CI` isn't set and the output isn't `--json`. Otherwise
 * nobody may be there to answer, and the command must not hang waiting.
 */
export function canAsk({ env, stdinIsTerminal, json }: AskInputs): boolean {
  return stdinIsTerminal && !json && !runsInCi(env);
}

/** The terminal a question is asked in: stderr to write it, stdin to read the answer. */
export interface QuestionTerminal {
  /** Writes text to stderr as it is, without adding a newline, so the answer follows on the same line. */
  write(text: string): void;
  /** The next line the user types, or `undefined` when stdin has ended. */
  readLine(): Promise<string | undefined>;
}

export interface AskOptions {
  /**
   * Whether the command's `--yes` already answered the question. The
   * command decides it: `trust` counts `--yes` only with a matching
   * `--fingerprint` (cli-output 1.7).
   */
  readonly yes: boolean;
  /** Whether a question may be asked, from {@link canAsk}. */
  readonly canAsk: boolean;
  readonly terminal: QuestionTerminal;
  /** The message in stderr's colours and marks. */
  readonly render: (message: Message) => string;
  /**
   * The error for when no question may be asked. It says what the answer
   * would have been for and names the flags that give it, such as
   * "… there's no terminal to ask you. Review it with halonic trust --dir
   * ./acme, then pass --yes --fingerprint <fingerprint>."
   */
  readonly refusal: () => Error;
}

/**
 * Asks a yes-or-no question with `[y/N]` (cli-output 1.7) and returns
 * whether the answer was yes. No is the careful default: only "y" or "yes"
 * count as yes, and an empty line or the end of stdin is no. When
 * {@link AskOptions.yes} is true it asks nothing and returns yes, even in a
 * terminal, so a script that passes `--yes` never waits on stdin. Otherwise,
 * when {@link AskOptions.canAsk} is false, it asks nothing and throws the
 * refusal.
 *
 * @param question - the question, such as "Trust Acme on this computer?"
 */
export async function askYesNo(question: Message, options: AskOptions): Promise<boolean> {
  if (options.yes) {
    return true;
  }
  if (!options.canAsk) {
    throw options.refusal();
  }
  options.terminal.write(options.render(questionMessages.yesNo(question.phrase)));
  const answer = await options.terminal.readLine();
  return isYes(answer);
}

function isYes(answer: string | undefined): boolean {
  const word = answer?.trim().toLowerCase();
  return word === "y" || word === "yes";
}
