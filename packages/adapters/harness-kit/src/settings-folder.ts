import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Where a harness writes its files (the agent's settings folder, and a
 * run's own files) and looks at the working folder: this computer's disk,
 * or a fake in tests.
 */
export interface SettingsFolderWriter {
  /** The file's text, or `null` when there is no such file. */
  read(path: string): Promise<string | null>;
  /** Writes `text` to the file, creating its folder. A reader sees the old text or the new, never a part. */
  write(path: string, text: string): Promise<void>;
  /** The names of everything in `folder`, hidden entries too; none when there is no such folder. */
  list(folder: string): Promise<string[]>;
  /** Removes the file, folder or link at `path`, with everything in a folder; a link's target stays. Nothing there is fine. */
  remove(path: string): Promise<void>;
  /** Whether anything is at `path`: a file, a folder, or a link, even one that points nowhere. */
  exists(path: string): Promise<boolean>;
}

/** What {@link resetSettingsFolder} leaves in the agent's settings folder. */
export interface SettingsFolderContents {
  /** Halonic's own files for the program, by file name, as {@link writeSettingsFiles} writes them. */
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
 * await resetSettingsFolder(folder, { files: { "config.toml": text }, signIn: ["auth.json"] }, diskSettingsFolder);
 */
export async function resetSettingsFolder(
  folder: string,
  { files, signIn }: SettingsFolderContents,
  writer: SettingsFolderWriter,
): Promise<void> {
  const kept = new Set([...Object.keys(files), ...signIn]);
  for (const name of await writer.list(folder)) {
    if (!kept.has(name)) await writer.remove(join(folder, name));
  }
  await writeSettingsFiles(folder, files, writer);
}

/**
 * Writes `files`, by file name, into `folder` (requirement
 * `harness-kit.settings-folder`). A file that already holds the same text is
 * left alone: the program may watch its settings, and another run of the
 * agent may be reading them.
 *
 * @example
 * await writeSettingsFiles(profile.settingsFolder, { "settings.json": "{}\n" }, diskSettingsFolder);
 */
export async function writeSettingsFiles(
  folder: string,
  files: Readonly<Record<string, string>>,
  writer: SettingsFolderWriter,
): Promise<void> {
  for (const [name, text] of Object.entries(files)) {
    const path = join(folder, name);
    if ((await writer.read(path)) === text) continue;
    await writer.write(path, text);
  }
}

/** Writes settings files on this computer's disk. Each file is written aside and then renamed into place. */
export const diskSettingsFolder: SettingsFolderWriter = {
  async read(path) {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  },
  async write(path, text) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(temporary, text, "utf8");
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  },
  async list(folder) {
    try {
      return await readdir(folder);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
  },
  async remove(path) {
    // A program that has just ended can still hold a file on Windows for a moment.
    await rm(path, { recursive: true, force: true, maxRetries: 3 });
  },
  async exists(path) {
    try {
      await lstat(path);
      return true;
    } catch (error) {
      if (isMissing(error) || hasCode(error, "ENOTDIR")) return false;
      throw error;
    }
  },
};

function isMissing(error: unknown): boolean {
  return hasCode(error, "ENOENT");
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
