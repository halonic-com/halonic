// `halonic google reset`: the way out when the profile's token key is gone
// while secrets it sealed remain. Nobody ever sees a key Halonic made, so
// there may be no key to set back; removing what it sealed lets Google be set
// up again with a new key (HAL-13881).

import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { profileFolder, tokenFolders } from "@halonicjs/profile";
import { KindedError } from "@halonicjs/std";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import type { GoogleSetup } from "../../google-host.ts";
import { googleMessages } from "../../messages/google.ts";
import { plainText } from "../../messages/phrase.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";

/**
 * Removes, after asking or straight away with `--yes`, everything the
 * profile's token key seals: the `google` folder, with the accounts set up
 * and their sealed client secrets and refresh tokens, and the integrations'
 * sealed sign-ins. The key itself is left: a key that is there still works
 * for new secrets, and without one a new key is made at the next setup.
 * Answering No, or Enter, removes nothing and exits 1. When there is
 * nothing to remove it says so without asking and succeeds, so a second run
 * does too. A folder that is there but can't be read stops it before it
 * asks, with the `denied` kind (exit 7), so a script can tell it from No.
 *
 * @throws UsageError with an argument, or when there's no terminal to ask and no `--yes`
 * @throws KindedError (`denied`) when a folder it removes can't be read
 */
export async function resetGoogle(
  input: CommandInput,
  context: CommandContext,
  setup: GoogleSetup,
): Promise<CommandResult> {
  if (input.positionals.length > 0) {
    throw new UsageError(googleMessages.resetTakesNothing(), googleMessages.resetUsage());
  }
  const folders = sealedFolders(setup);
  if (!(await anyHoldsSomething(folders))) {
    return {
      exitCode: exitCode.ok,
      lines: [googleMessages.resetNothingThere().phrase],
      json: { removed: false },
    };
  }
  const sure = await context.ask({
    question: googleMessages.resetQuestion(),
    yes: input.options["yes"] === true,
    refusal: () =>
      new UsageError(googleMessages.resetNoTerminal(), googleMessages.resetNoTerminalFix()),
  });
  if (!sure) {
    return {
      exitCode: exitCode.failed,
      lines: [googleMessages.notReset().phrase],
      json: { removed: false },
    };
  }

  for (const folder of folders) {
    await rm(folder, { recursive: true, force: true });
  }
  return {
    exitCode: exitCode.ok,
    lines: [googleMessages.resetDone().phrase],
    json: { removed: true },
  };
}

/** The folders that hold what the token key seals, with the Google setups that point into them. */
function sealedFolders(setup: GoogleSetup): readonly string[] {
  const folder = profileFolder(setup.profile ?? nodeProfileEnvironment());
  return [join(folder.root, "google"), tokenFolders(folder).integrationSignIns];
}

/**
 * Whether any of the folders is there and holds at least one entry.
 *
 * @throws KindedError (`denied`) for a folder that is there but can't be read, so it isn't taken for empty
 */
async function anyHoldsSomething(folders: readonly string[]): Promise<boolean> {
  for (const folder of folders) {
    const entries = await entriesOf(folder);
    if (entries.length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Node's codes for a folder that is there but can't be listed: no read
 * access, or a file where the folder belongs.
 */
const unreadableCodes: ReadonlySet<string | undefined> = new Set(["EACCES", "EPERM", "ENOTDIR"]);

/** The entries in `folder`, or none when it doesn't exist. */
async function entriesOf(folder: string): Promise<string[]> {
  try {
    return await readdir(folder);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    if (unreadableCodes.has(code)) {
      throw new KindedError(
        "denied",
        plainText(googleMessages.resetFolderUnreadable(folder).phrase),
        {
          fix: plainText(googleMessages.resetFolderUnreadableFix().phrase),
          cause: error,
        },
      );
    }
    throw error;
  }
}
