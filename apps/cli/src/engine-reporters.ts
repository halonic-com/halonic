// What the CLI says while an engine runs, that isn't a run's own line: the
// tools a turn left out until someone reviews them, and each harness agent's
// access to its model.

import type { ChatTurnWaiting } from "@halonicjs/ports";
import type { LocalEngineInput } from "./cli-local-engine.ts";
import type { CommandContext } from "./command.ts";
import { markPart, type Phrase, phrase } from "./messages/phrase.ts";
import { runMessages } from "./messages/run.ts";
import { printable } from "./output/printable.ts";

/**
 * The engine's `reportWaiting`: a warning naming the command that reviews
 * the tools a turn left out, shown with or without `--debug`. A run asks
 * about them at every step, so each warning is written once for each
 * connector and set of tools.
 *
 * @example
 * const reportWaiting = waitingReporter((line) => context.warn(line));
 * reportWaiting("notes", [{ source: "notes", name: "lookup" }]);
 * // ! The tool lookup of notes is off until you review it. To review it, run halonic tools review notes
 */
export function waitingReporter(
  warn: (line: Phrase) => void,
): (connector: string, waiting: readonly ChatTurnWaiting[]) => void {
  const told = new Set<string>();
  return (connector, waiting) => {
    const names = waiting.map((tool) => tool.name).join(", ");
    const key = `${connector}\n${names}`;
    if (told.has(key)) return;
    told.add(key);
    const line = runMessages.toolsWaiting(
      printable(connector),
      waiting.map((tool) => tool.name),
      `halonic tools review ${printable(connector)}`,
    );
    warn(phrase`${markPart("needsYou")} ${line.phrase}`);
  };
}

/**
 * What the CLI says of each harness agent's access to its model (HAL-12784):
 * the key it spends in a `--debug` line, by provider and secret name, and a
 * warning when a sandboxed agent has no key and may run signed out. On this
 * computer the program's own sign-in works, so nothing is said.
 */
export function accessReporter(
  context: Pick<CommandContext, "debug" | "warn">,
): NonNullable<LocalEngineInput["reportAccess"]> {
  return (agent, choice) => {
    const name = printable(agent.agentId);
    if (choice.kind === "key") {
      context.debug(
        runMessages.harnessKey(name, printable(choice.providerId), printable(choice.secret)).phrase,
      );
    } else if (choice.reason === "no-keyed-provider") {
      context.warn(runMessages.harnessSignedOut(name, choice.provider).phrase);
    }
  };
}
