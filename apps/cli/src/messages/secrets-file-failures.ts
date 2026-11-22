// The fix line of a run the profile's secrets file stopped because the
// person's user account can't read it (HAL-15693): the same fix the secrets
// file store gives `halonic secret list` for the same file (requirement
// `secrets-file.unreadable`), by the fix the run log's cause names.

import type { SecretsFileUnreadableFailure } from "@halonicjs/app/run-failure";
import { shellWord } from "../output/shell-word.ts";
import { type Phrase, phrase } from "./phrase.ts";

/** Line 2 of `secrets-file-unreadable`: chmod 600, sudo chown first, or the file's Properties on Windows. */
export function unreadableSecretsFileFix(failure: SecretsFileUnreadableFailure): Phrase {
  const word = shellWord(failure.file);
  switch (failure.fix) {
    case "chmod":
      return phrase`Run chmod 600 ${word}, then run again.`;
    case "chown":
      return phrase`It belongs to another user: run sudo chown "$(id -un)" ${word}, then chmod 600 ${word}, then run again.`;
    case "properties":
      return phrase`Give your user account access to it in the file's Properties, under Security, then run again.`;
  }
}
