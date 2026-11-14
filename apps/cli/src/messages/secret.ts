import { defineMessages } from "./define.ts";
import { markPart, phrase } from "./phrase.ts";

/**
 * The sentences of `halonic secret set | remove | list`. A secret's value is
 * never in a sentence: only its name, and a reason the secret service gives,
 * which never repeats a value either.
 */
export const secretMessages = defineMessages("secret", {
  summary: () => phrase`Set, remove or list the secrets kept on this computer`,
  setSummary: () => phrase`Save a secret; the value comes from a hidden prompt or from stdin`,
  removeSummary: () => phrase`Remove a secret`,
  listSummary: () => phrase`List the names of the saved secrets, never their values`,
  /** What `secret set` was doing, for "✕ Couldn't save the secret: …". */
  setAction: () => phrase`save the secret`,
  /** What `secret remove` was doing, for "✕ Couldn't remove the secret: …". */
  removeAction: () => phrase`remove the secret`,
  /** What `secret list` was doing, for "✕ Couldn't list the secrets: …". */
  listAction: () => phrase`list the secrets`,

  saved: (name: string) => phrase`${markPart("done")} Saved ${name}.`,
  removed: (name: string) => phrase`${markPart("done")} Removed ${name}.`,
  noSecrets: () => phrase`No secrets are saved.`,

  setNeedsName: () => phrase`halonic secret set needs the secret's name.`,
  setUsage: () => phrase`halonic secret set <name>`,
  removeNeedsName: () => phrase`halonic secret remove needs the secret's name.`,
  removeUsage: () => phrase`halonic secret remove <name>`,
  /** A value after the name: it would sit in the shell's history and the process list. */
  valueAsArgument: () => phrase`A secret's value can't be given as an argument.`,
  valueAsArgumentFix: (name: string) =>
    phrase`Type it at the prompt, or pipe it in: halonic secret set ${name} < file`,
  /** `list` takes no arguments. */
  listTakesNone: () => phrase`halonic secret list takes no arguments.`,
  listUsage: () => phrase`halonic secret list`,

  /** The service's own refusal, such as a name that isn't allowed; nothing was saved or removed. */
  refused: (reason: string) => phrase`${reason}`,

  /** The hidden prompt's label, after which ": " is written. */
  valuePrompt: (name: string) => phrase`Value for ${name}`,
  passwordPrompt: () => phrase`Sign-in password`,
  passwordAgainPrompt: () => phrase`Sign-in password again`,
  /** Nobody can type the value: no terminal, `CI` or `--json`. */
  noTerminal: (name: string) => phrase`There's no terminal to type the value of ${name} in.`,
  noTerminalFix: (name: string) => phrase`Pipe it in instead: halonic secret set ${name} < file`,
  /** Stdin held no value, or only a line ending. */
  noValue: (name: string) => phrase`No value was given for ${name}. Nothing was saved.`,
  noValueFix: (name: string) =>
    phrase`Type it at the prompt, or pipe it in: halonic secret set ${name} < file`,
});
