// The agent's settings folder, written through a {@link SettingsFolderWriter}
// under the path rules of the machine the program runs on. Web-safe: the
// desktop's disk writer lives in `settings-folder.ts`.

import type { HostPaths } from "./host-paths.ts";

/**
 * Where a harness writes its files (the agent's settings folder, and a
 * run's own files) and looks at the working folder: this computer's disk,
 * or a fake in tests.
 */
export interface SettingsFolderWriter {
  /** The file's text, or `null` when there is no such file. */
  read(path: string): Promise<string | null>;
  /**
   * Writes `text` to the file, creating its folder. A reader sees the old
   * text or the new, never a part. `mode` sets the new file's permissions,
   * such as `0o600` for a file that holds a key; without it the system's default applies.
   */
  write(path: string, text: string, options?: SettingsFileOptions): Promise<void>;
  /** The names of everything in `folder`, hidden entries too; none when there is no such folder. */
  list(folder: string): Promise<string[]>;
  /** Removes the file, folder or link at `path`, with everything in a folder; a link's target stays. Nothing there is fine. */
  remove(path: string): Promise<void>;
  /** Whether anything is at `path`: a file, a folder, or a link, even one that points nowhere. */
  exists(path: string): Promise<boolean>;
}

/** How {@link SettingsFolderWriter.write} writes a file. */
export interface SettingsFileOptions {
  /** The file's permissions, such as `0o600`; on Windows only its read-only part counts. */
  readonly mode?: number;
}

/** What {@link resetSettingsFolderWith} leaves in the agent's settings folder. */
export interface SettingsFolderContents {
  /** Halonic's own files for the program, by file name, as {@link writeSettingsFilesWith} writes them. */
  readonly files: Readonly<Record<string, string>>;
  /** The names of the files that hold the program's sign-in, which stay as they are. */
  readonly signIn: readonly string[];
}

/**
 * Makes the agent's settings folder hold only Halonic's files and the
 * program's sign-in (requirement `harness-kit.settings-folder-reset`):
 * everything else at its top level is removed, then the files are written.
 * The folder stays between runs and the program may write in it, so
 * without this a file one run left there, such as a user-level instructions
 * file, would reach every later run of the agent.
 *
 * @example
 * await resetSettingsFolderWith(posixPath, folder, { files: { "config.toml": text }, signIn: ["auth.json"] }, writer);
 */
export async function resetSettingsFolderWith(
  paths: Pick<HostPaths, "join">,
  folder: string,
  { files, signIn }: SettingsFolderContents,
  writer: SettingsFolderWriter,
): Promise<void> {
  const kept = new Set([...Object.keys(files), ...signIn]);
  for (const name of await writer.list(folder)) {
    if (!kept.has(name)) await writer.remove(paths.join(folder, name));
  }
  await writeSettingsFilesWith(paths, folder, files, writer);
}

/**
 * Writes `files`, by file name, into `folder` (requirement
 * `harness-kit.settings-folder`). A file that already holds the same text is
 * left alone: the program may watch its settings, and another run of the
 * agent may be reading them.
 *
 * @example
 * await writeSettingsFilesWith(posixPath, profile.settingsFolder, { "settings.json": "{}\n" }, writer);
 */
export async function writeSettingsFilesWith(
  paths: Pick<HostPaths, "join">,
  folder: string,
  files: Readonly<Record<string, string>>,
  writer: SettingsFolderWriter,
): Promise<void> {
  for (const [name, text] of Object.entries(files)) {
    const path = paths.join(folder, name);
    if ((await writer.read(path)) === text) continue;
    await writer.write(path, text);
  }
}
