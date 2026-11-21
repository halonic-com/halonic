// `halonic google reset`: the way out when the profile's token key is gone
// while secrets it sealed remain. Nobody ever sees a key Halonic made, so
// there may be no key to set back; removing what it sealed lets Google be set
// up again with a new key (HAL-13881).

import { rm } from "node:fs/promises";
import { join } from "node:path";
import { profileFolder, tokenFolders } from "@halonicjs/profile";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import type { GoogleSetup } from "../../google-host.ts";
import { googleMessages } from "../../messages/google.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";

/**
 * Removes, after asking or straight away with `--yes`, everything the
 * profile's token key seals: the `google` folder, with the accounts set up
 * and their sealed client secrets and refresh tokens, and the integrations'
 * sealed sign-ins. The key itself is left: a key that is there still works
 * for new secrets, and without one a new key is made at the next setup.
 * Answering No, or Enter, removes nothing and exits 1. A second run finds
 * nothing to remove and succeeds.
 *
 * @throws UsageError with an argument, or when there's no terminal to ask and no `--yes`
 */
export async function resetGoogle(
  input: CommandInput,
  context: CommandContext,
  setup: GoogleSetup,
): Promise<CommandResult> {
  if (input.positionals.length > 0) {
    throw new UsageError(googleMessages.resetTakesNothing(), googleMessages.resetUsage());
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

  for (const folder of sealedFolders(setup)) {
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
