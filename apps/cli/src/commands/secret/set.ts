// `halonic secret set <name>`: saves a secret. A thin command over
// `SecretService.set`: the service decides what may be saved and how, this
// file gets the value from the hidden prompt or from stdin, never from an
// argument, and says what happened.

import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { secretMessages } from "../../messages/secret.ts";
import { printable } from "../../output/printable.ts";
import { openSecretService, processStdin, type SecretSetup } from "../../secret-host.ts";

/**
 * Saves the secret `name`. At a terminal the value is typed at a hidden
 * prompt; with stdin piped it is what was piped in, without its last line
 * ending. The sign-in password is asked twice at a terminal.
 *
 * @throws UsageError without a name, with a value as an argument, when the
 *   service refuses the name or value, when there is no value, or when nobody
 *   can type one (no terminal, `CI` or `--json`)
 */
export async function setSecret(
  input: CommandInput,
  context: CommandContext,
  setup: SecretSetup,
): Promise<CommandResult> {
  const [name, ...extra] = input.positionals;
  if (name === undefined) {
    throw new UsageError(secretMessages.setNeedsName(), secretMessages.setUsage());
  }
  if (extra.length > 0) {
    throw new UsageError(
      secretMessages.valueAsArgument(),
      secretMessages.valueAsArgumentFix(printable(name)),
    );
  }
  const service = openSecretService(setup);
  const plan = service.planSet(name);
  if ("reason" in plan) {
    throw refused(plan.reason);
  }
  const shown = printable(name);
  const stdin = setup.stdin ?? processStdin;
  const typed = stdin.isTerminal;
  const value = typed ? await typedValue(context, shown, plan.typedTwice) : await pipedValue(stdin);
  if (value === undefined) {
    throw new UsageError(secretMessages.noValue(shown), secretMessages.noValueFix(shown));
  }
  let confirmation = value;
  if (typed && plan.typedTwice) {
    const again = await askValue(context, secretMessages.passwordAgainPrompt(), shown);
    if (again === undefined) {
      throw new UsageError(secretMessages.noValue(shown), secretMessages.noValueFix(shown));
    }
    confirmation = again;
  }
  const change = await service.set({ name, value, confirmation });
  if (!change.changed) {
    throw refused(change.reason);
  }
  return {
    exitCode: exitCode.ok,
    lines: [secretMessages.saved(shown).phrase],
    json: { name, saved: true },
  };
}

function typedValue(context: CommandContext, shown: string, password: boolean) {
  return askValue(
    context,
    password ? secretMessages.passwordPrompt() : secretMessages.valuePrompt(shown),
    shown,
  );
}

function askValue(
  context: CommandContext,
  prompt: ReturnType<typeof secretMessages.valuePrompt>,
  shown: string,
) {
  return context.askSecret(
    prompt,
    () => new UsageError(secretMessages.noTerminal(shown), secretMessages.noTerminalFix(shown)),
  );
}

/** What was piped in without its last line ending, or `undefined` when that is nothing. */
async function pipedValue(stdin: { read(): Promise<string> }): Promise<string | undefined> {
  const text = (await stdin.read()).replace(/\r?\n$/u, "");
  return text === "" ? undefined : text;
}

/** The service's refusal as the command's usage error; the reason never repeats a value. */
export function refused(reason: string): UsageError {
  return new UsageError(secretMessages.refused(printable(reason)));
}
