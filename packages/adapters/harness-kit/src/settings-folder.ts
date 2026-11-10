import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Where a harness writes its files (the agent's settings folder, and a
 * run's own files): this computer's disk, or a fake in tests.
 */
export interface SettingsFolderWriter {
  /** The file's text, or `null` when there is no such file. */
  read(path: string): Promise<string | null>;
  /** Writes `text` to the file, creating its folder. A reader sees the old text or the new, never a part. */
  write(path: string, text: string): Promise<void>;
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
};

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
