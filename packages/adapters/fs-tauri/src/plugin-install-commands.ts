/**
 * The shell's plugin install commands, behind `TauriPluginSourceReader`,
 * `TauriPluginFolderWriter.place` and `TauriPluginInstallSource`: the folder
 * a person picks, one commit of a git repository, and the writing of a
 * checked plugin into the plugins folder. The page never names a path:
 * the shell keeps what the person picked, or what it exported, and gives
 * the page a `location` for it that only it can use.
 *
 * Every call that reads names the `source` location an earlier answer gave.
 * The shell refuses any other, a typed path included, as `source_not_picked`.
 * Nothing here runs the plugin: core checks the bytes it read and the shell
 * writes exactly those.
 */
export const pluginInstallCommands = {
  /** `{}` → the picked folder's location, or `null` when the person picks nothing. Shows the computer's folder picker. */
  pick: "plugin_source_pick",
  /** `{ source, dir, limit, recursive }` → entries as for `folder_entries`, of a picked or exported folder, without its `.git`. */
  entries: "plugin_source_entries",
  /** `{ source, path }` → the file's exact bytes as base64url, or `null` when there is no file. */
  read: "plugin_source_read",
  /**
   * `{ plugin, files: [{ path, bytes }], replace }` → `"placed"`, or `"taken"` when the name is
   * in use in any case and nothing was written. `bytes` is base64url. Never runs anything.
   */
  place: "plugin_folder_place",
  /**
   * `{ address, reference, token }` → `{ location, commit, branch }`: one commit of a git
   * repository, files only, as a place to read from. `token` is the page's own name for the
   * export, which `gitExportEnd` stops it by.
   */
  gitExport: "plugin_git_export",
  /** `{ token }` → nothing. Stops the export if it runs, or removes the folder of one that finished. */
  gitExportEnd: "plugin_git_export_end",
} as const;

/** Why the shell refused an install call: the `kind` of its error, which names no secret. */
export const pluginInstallRefusalKinds = [
  /** The location is not a folder the person picked, or an export, in this session. Use Choose folder. */
  "source_not_picked",
  /** The pick is the Halonic profile folder or the plugins folder, or inside either. */
  "source_not_allowed",
  /** The path, or the plugin's name, is not one every system opens the same way. */
  "unsafe_path",
  /** The path is in the profile, or has a link in it. */
  "private_path",
  /** The file is a pipe, a socket or a device, which the shell never opens. */
  "special_path",
  /** A folder can't be read. */
  "folder_unreadable",
  /** A file in the plugin isn't text where text is needed. */
  "not_text",
  /** A file is larger than a plugin may be. */
  "too_big",
  /** The plugin has more files than a plugin may have. */
  "too_many_files",
  /** Reading or writing failed. */
  "io",
  /** The git address is not an `https://` or `ssh://` one, or has a password or an odd character. */
  "address_not_allowed",
  /** The branch, tag or commit is not a plain name or a full commit id. */
  "reference_not_allowed",
  /** The repository is larger than a plugin may be. */
  "export_too_large",
  /** The export was stopped, and its folders removed. */
  "cancelled",
  /** A git step failed; the message is git's own, without the address. */
  "export_failed",
  /** The export ran past its time limit. */
  "timed_out",
  /** git wrote more than the output limit. */
  "output_too_large",
  /** No `git` was found. */
  "git_not_found",
  /** git is older than 2.31, or doesn't take the shell's settings. */
  "git_too_old",
  "hardening_ignored",
  /** The export's token is not plain or is in use. The page makes a new one each time, so this is a bug. */
  "export_token_invalid",
  /** Too many exports are open. */
  "export_busy",
  /** The shell's own git folders are unusable. */
  "hooks_folder_not_empty",
  "hooks_folder_unreadable",
] as const;

/** One of {@link pluginInstallRefusalKinds}. */
export type PluginInstallRefusalKind = (typeof pluginInstallRefusalKinds)[number];

/** What a refused install command rejects with. */
export interface PluginInstallRefusal {
  readonly kind: PluginInstallRefusalKind;
  readonly message: string;
}

/** Whether a rejection is the shell's install refusal shape, as opposed to an IPC or permission failure. */
export function isPluginInstallRefusal(reason: unknown): reason is PluginInstallRefusal {
  if (typeof reason !== "object" || reason === null) {
    return false;
  }
  const { kind, message } = reason as Record<string, unknown>;
  return pluginInstallRefusalKinds.some((known) => known === kind) && typeof message === "string";
}
