// `halonic models allow-address <key-name> <address>`: lets a provider send a
// stored key to one more address. A thin command over
// `FileSecretStore.addAllowedOrigin`: the store decides what an address is and
// what the list may hold, this file refuses a run, passes the words on and says
// what happened.

import type { AddOriginResult } from "@halonicjs/adapter-secrets-file";
import { maxAllowedOrigins } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  OwnLineError,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { modelsMessages } from "../../messages/models.ts";
import { plainText } from "../../messages/phrase.ts";
import { printable } from "../../output/printable.ts";
import { shellWord } from "../../output/shell-word.ts";
import { openSecretStore, type SecretSetup } from "../../secret-host.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { insideRun } from "./inside-run.ts";

/**
 * Allows the address for the key. The run check comes first, before the
 * address is read or the profile is opened.
 *
 * @throws OwnLineError `denied` inside a run, `not_found` for a key that isn't
 *   stored, `limit_reached` when the key has the most addresses
 * @throws UsageError without a key name and an address, or for an address
 *   that isn't one or holds a user name or password
 * @throws KindedError `unavailable` when the profile's secrets file can't be
 *   read or written
 */
export async function allowAddress(
  input: CommandInput,
  _context: CommandContext,
  setup: SecretSetup,
): Promise<CommandResult> {
  const profile = setup.profile ?? nodeProfileEnvironment();
  if (insideRun(profile.variables)) {
    throw new OwnLineError("denied", modelsMessages.insideRun(), modelsMessages.insideRunFix());
  }
  const [name, typed, ...extra] = input.positionals;
  if (name === undefined || typed === undefined || extra.length > 0) {
    throw new UsageError(modelsMessages.needsKeyAndAddress(), modelsMessages.allowAddressUsage());
  }
  const outcome = await addAddress(setup, name, typed);
  return resultOf(outcome, { key: printable(name), keyWord: shellWord(name), typed });
}

async function addAddress(
  setup: SecretSetup,
  name: string,
  address: string,
): Promise<AddOriginResult> {
  try {
    return await openSecretStore(setup.profile).addAllowedOrigin(name, address);
  } catch (error) {
    // The cause stays for --debug; its text is a location and fix, never a value.
    throw new KindedError("unavailable", plainText(modelsMessages.cantReadAddresses().phrase), {
      cause: error,
    });
  }
}

/** The key as it is shown, the key as one word of a command to copy, and the address as typed. */
interface Shown {
  readonly key: string;
  readonly keyWord: string;
  readonly typed: string;
}

function resultOf(outcome: AddOriginResult, shown: Shown): CommandResult {
  switch (outcome.result) {
    case "added":
      return allowed(outcome.origin, shown, true);
    case "already-allowed":
      return {
        exitCode: exitCode.ok,
        lines: [modelsMessages.alreadyAllowed(outcome.origin, shown.key).phrase],
        json: { key: shown.key, address: outcome.origin, changed: false },
      };
    case "no-key":
      throw new OwnLineError("not_found", modelsMessages.noKey(shown.key, shown.keyWord));
    case "full":
      throw new OwnLineError(
        "limit_reached",
        modelsMessages.tooManyAddresses(shown.key, maxAllowedOrigins),
      );
    case "bad-address":
      throw new UsageError(
        outcome.problem === "has-user-info"
          ? modelsMessages.addressHasUserInfo()
          : modelsMessages.notAnAddress(printable(shown.typed)),
      );
  }
}

/** The success line, after the note that a path was dropped when the person typed more than the address. */
function allowed(
  origin: string,
  shown: { key: string; typed: string },
  changed: boolean,
): CommandResult {
  const lines = [modelsMessages.allowed(origin, shown.key).phrase];
  if (typedMoreThan(origin, shown.typed)) {
    lines.unshift(modelsMessages.onlyAddressKept(origin).phrase);
  }
  return { exitCode: exitCode.ok, lines, json: { key: shown.key, address: origin, changed } };
}

/** Whether the typed address had a path, query or fragment: the stored form is the scheme, host and port only. */
function typedMoreThan(origin: string, typed: string): boolean {
  const url = URL.parse(typed);
  return (
    url !== null &&
    (url.pathname !== "/" || url.search !== "" || url.hash !== "") &&
    url.origin === origin
  );
}
