// The engine's lock as the CLI's commands hold it (HAL-14299): the lock
// names the command that holds it, so another command refused by it can say
// which one, and how to stop it when it runs until stopped.

import { type HeldLock, holdLock, LockHeldError } from "@halonicjs/adapter-fs-node";
import { KindedError } from "@halonicjs/std";
import { plainText } from "./messages/phrase.ts";
import { workspaceMessages } from "./messages/workspace.ts";

/**
 * Each CLI command that opens an engine: the words its lock names it by,
 * and whether it runs until someone stops it with Ctrl C, as a watch does,
 * or ends by itself, as a run does.
 */
export const engineHolders = {
  run: { command: "run", runsUntilStopped: false },
  runsSend: { command: "runs send", runsUntilStopped: false },
  routinesWatch: { command: "routines watch", runsUntilStopped: true },
  serve: { command: "serve", runsUntilStopped: true },
} as const;

/** A CLI command that opens an engine, such as `routinesWatch` for `halonic routines watch`. */
export type EngineHolder = keyof typeof engineHolders;

/** One entry of {@link engineHolders}. */
type EngineHolderEntry = (typeof engineHolders)[EngineHolder];

/**
 * Takes the engine's lock, or refuses with a `conflict` the CLI can show:
 * the lock's own error names a path in the profile, so it is only the cause.
 * A lock a CLI command holds is named by that command, and one that runs
 * until it is stopped says how to stop it, since waiting would never end
 * (HAL-14299).
 */
export async function holdEngineLock(
  file: string,
  options: Parameters<typeof holdLock>[1],
): Promise<HeldLock> {
  try {
    return await holdLock(file, options);
  } catch (error) {
    if (!(error instanceof LockHeldError)) {
      throw error;
    }
    const record = error.holder;
    const holder = engineHolderOf(record?.holder);
    const message =
      record === null || holder === undefined
        ? workspaceMessages.engineOpen(record?.pid)
        : workspaceMessages.engineOpenBy(holder.command, record.pid);
    const fix =
      holder?.runsUntilStopped === true
        ? workspaceMessages.engineOpenStopFix()
        : workspaceMessages.engineOpenFix();
    throw new KindedError("conflict", plainText(message.phrase), {
      fix: plainText(fix.phrase),
      cause: error,
    });
  }
}

/** The command a lock names, when it is one of the CLI's; any other text names none. */
function engineHolderOf(text: string | undefined): EngineHolderEntry | undefined {
  return Object.values(engineHolders).find((each) => each.command === text);
}
