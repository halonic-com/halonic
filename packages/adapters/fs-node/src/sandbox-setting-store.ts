import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isSandboxSetting, type SandboxSetting, type SandboxSettingStore } from "@halonicjs/ports";
import { writeFlushedFile } from "./flushed-write.ts";
import { isMissing } from "./links.ts";
import { makePrivateFolder, readUnlinkedFile } from "./private-files.ts";
import { renameOver } from "./rename-over.ts";

/** The file name of the choice inside the folder. */
const settingFileName = "sandbox-setting.json";

/**
 * The person's sandbox choice as one JSON file in a folder of the user's
 * profile. Like the placement choices, a save writes a temporary file and
 * renames it over the choice, so a reader sees the old choice or the new
 * one, never half of one. The folder must never be inside a workspace: an
 * agent that edits the workspace must not be able to change the sandbox it
 * runs in. For the same reason a choice that is a link, such as one to a
 * file in a workspace, can't be read, and a save makes the folder private
 * even when it was already there. Only the file is checked, not the folder:
 * a folder that is itself a link is followed, which is safe only because
 * the folder lives in the profile.
 */
export class FileSandboxSettingStore implements SandboxSettingStore {
  readonly #root: string;

  /** @param root - the folder for the choice, such as `<profile>/sandbox`; created on the first save */
  constructor(root: string) {
    this.#root = resolve(root);
  }

  async get(): Promise<SandboxSetting | null> {
    const file = this.#file();
    let text: string;
    try {
      text = await readUnlinkedFile(file);
    } catch (error) {
      if (isMissing(error)) return null;
      throw unreadable(file, error);
    }
    return parseSetting(file, text);
  }

  async save(setting: SandboxSetting): Promise<void> {
    if (!isSandboxSetting(setting)) throw new Error("The sandbox choice isn't a valid choice.");
    // Only the fields of a choice are written, so `get` can read it back.
    const record =
      setting.backend === "none"
        ? {
            backend: setting.backend,
            chosenAt: setting.chosenAt,
            appVersion: setting.appVersion,
          }
        : { backend: setting.backend, chosenAt: setting.chosenAt };
    const text = `${JSON.stringify(record, null, 2)}\n`;
    const file = this.#file();
    const temporary = `${file}.${randomUUID()}.tmp`;
    await makePrivateFolder(this.#root);
    try {
      await writeFlushedFile(temporary, text, { mode: 0o600 });
      await renameOver(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async remove(): Promise<void> {
    // Deletes the file without reading it, so a damaged choice goes too.
    await rm(this.#file(), { force: true });
  }

  #file(): string {
    return join(this.#root, settingFileName);
  }
}

/** Reads a choice, and refuses one that isn't exactly a sandbox choice: a hand edit could add fields a launcher reads. */
function parseSetting(file: string, text: string): SandboxSetting {
  let setting: unknown;
  try {
    setting = JSON.parse(text);
  } catch (error) {
    throw unreadable(file, error);
  }
  if (!isSandboxSetting(setting)) {
    throw unreadable(file, new Error("It isn't a valid sandbox choice."));
  }
  return setting;
}

function unreadable(file: string, cause: unknown): Error {
  return new Error(`The sandbox choice can't be read (${JSON.stringify(file)}).`, { cause });
}
