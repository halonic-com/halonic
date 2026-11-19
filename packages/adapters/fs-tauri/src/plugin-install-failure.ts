import { KindedError } from "@halonicjs/std";
import { noAnswer } from "./command-folder-reader.ts";
import { isPluginInstallRefusal } from "./plugin-install-commands.ts";

/**
 * The error a rejected install command becomes (`fs-tauri.plugin-install`).
 * A path or plugin name the shell refuses is a `RangeError`, as the ports
 * ask. A location the person never picked, or a pick the shell won't take,
 * is `denied`; a plugin or repository that is too large, or an address or
 * commit that isn't allowed, is `invalid_input`; a stopped export is
 * `conflict`. Anything that isn't the shell's refusal shape, such as a page
 * without the capability, is `unavailable` with its text dropped: the
 * adapter can't vouch for it.
 *
 * The first four kinds are the shell's own sentence for the person and keep
 * it as it is. The rest stay `unavailable`, with the shell's text after a
 * line that says which call it was; the shell writes it without the address
 * or a path.
 */
export function pluginInstallFailure(reason: unknown): Error {
  if (!isPluginInstallRefusal(reason)) {
    return noAnswer();
  }
  // What the shell says to the person is its own sentence, so it goes on as it is.
  const said = reason.message;
  const message = `The plugin install call was refused: ${reason.message}`;
  switch (reason.kind) {
    case "unsafe_path":
    case "private_path":
    case "special_path":
      return new RangeError(message, { cause: reason });
    case "source_not_picked":
    case "source_not_allowed":
      return new KindedError("denied", said, { cause: reason });
    case "too_big":
    case "too_many_files":
    case "export_too_large":
    case "address_not_allowed":
    case "reference_not_allowed":
    case "not_text":
      return new KindedError("invalid_input", said);
    case "cancelled":
      return new KindedError("conflict", said);
    case "export_busy":
      return new KindedError("limit_reached", said);
    case "folder_unreadable":
    case "io":
    case "export_failed":
    case "timed_out":
    case "output_too_large":
    case "git_not_found":
    case "git_too_old":
    case "hardening_ignored":
    case "export_token_invalid":
    case "hooks_folder_not_empty":
    case "hooks_folder_unreadable":
      return new KindedError("unavailable", message);
  }
}

/**
 * Whether `error` is the shell's refusal of a location the person never
 * picked, such as a folder path typed in the Add plugin dialog: the one
 * refusal the dialog answers under the field rather than as a failed add.
 */
export function isSourceNotPicked(error: unknown): boolean {
  if (!(error instanceof KindedError)) return false;
  return isPluginInstallRefusal(error.cause) && error.cause.kind === "source_not_picked";
}
