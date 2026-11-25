import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import thisComputer, { dirname } from "node:path";
import {
  resetSettingsFolderWith,
  type SettingsFolderContents,
  type SettingsFolderWriter,
  writeSettingsFilesWith,
} from "./settings-files.ts";

export type {
  SettingsFileOptions,
  SettingsFolderContents,
  SettingsFolderWriter,
} from "./settings-files.ts";

/**
 * {@link resetSettingsFolderWith} under this computer's path rules
 * (requirement `harness-kit.settings-folder-reset`).
 *
 * @example
 * await resetSettingsFolder(folder, { files: { "config.toml": text }, signIn: ["auth.json"] }, diskSettingsFolder);
 */
export function resetSettingsFolder(
  folder: string,
  contents: SettingsFolderContents,
  writer: SettingsFolderWriter,
): Promise<void> {
  return resetSettingsFolderWith(thisComputer, folder, contents, writer);
}

/**
 * {@link writeSettingsFilesWith} under this computer's path rules
 * (requirement `harness-kit.settings-folder`).
 *
 * @example
 * await writeSettingsFiles(profile.settingsFolder, { "settings.json": "{}\n" }, diskSettingsFolder);
 */
export function writeSettingsFiles(
  folder: string,
  files: Readonly<Record<string, string>>,
  writer: SettingsFolderWriter,
): Promise<void> {
  return writeSettingsFilesWith(thisComputer, folder, files, writer);
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
  async write(path, text, options = {}) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    try {
      // The aside file is new, so `mode` applies to it, and the rename keeps it.
      await writeFile(temporary, text, { encoding: "utf8", mode: options.mode });
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
