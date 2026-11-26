import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  makePrivateFolder,
  readUnlinkedFile,
  renameOver,
  writeFlushedFile,
} from "@halonicjs/adapter-fs-node";
import { checkedServerOrigin } from "@halonicjs/host-server";
import type { Digest } from "@halonicjs/ports";
import { type ProfileFolder, workspaceFolders } from "@halonicjs/profile";

/** The setting's file in the workspace's own folder of the profile; none means "This computer". */
export const messagingEngineFileName = "messaging-engine.json";

/** The only version of the file this host reads and writes. */
const settingVersion = 1;

/** Where a workspace's messaging runs: on this computer (the default), or on a Halonic server. */
export type MessagingEngine = { kind: "this-computer" } | { kind: "server"; address: string };

/** A workspace's setting, with the key that names its folder in the profile and its server pairing. */
export interface WorkspaceEngineSetting {
  /** The workspace's key in the profile's `workspaces` folder: 32 lower-case hex digits. */
  key: string;
  engine: MessagingEngine;
}

/** What the setting reads and writes with. */
export interface MessagingEngineSettingOptions {
  profile: ProfileFolder;
  digest: Digest;
  /** Says why a file was read as "This computer"; never what the file holds. */
  warn: (message: string) => void;
}

/**
 * Each workspace's messaging engine (`agent-host.messaging-engine`), kept in
 * the profile at `workspaces/<key>/messaging-engine.json` as
 * `{ "version": 1, "engine": "server", "address": "https://…" }`. The key
 * comes from the profile's `workspaceFolders`, never from the workspace's
 * own files, so a `git pull` can't change the engine. The file never holds
 * a token: the device token lives in the keychain (`ServerPairings`).
 */
export class MessagingEngineSetting {
  readonly #options: MessagingEngineSettingOptions;

  constructor(options: MessagingEngineSettingOptions) {
    this.#options = options;
  }

  /**
   * The workspace's engine. No file is "This computer". An unreadable file,
   * one of another version or an address that breaks the server client's
   * rule (`https`, or plain `http` to this computer only) is "This computer"
   * too, with one warning; it never throws for what the file holds.
   *
   * @param workspace - the workspace's real path, as the launcher named it
   */
  async read(workspace: string): Promise<WorkspaceEngineSetting> {
    const { key, file } = await this.#place(workspace);
    let text: string;
    try {
      text = await readUnlinkedFile(file);
    } catch (error) {
      if (isMissing(error)) return { key, engine: { kind: "this-computer" } };
      return { key, engine: this.#thisComputer(`it can't be read (${errorName(error)})`) };
    }
    return { key, engine: this.#parse(text) };
  }

  /**
   * Saves "Server" at `address`: a temporary file with mode 0600, renamed
   * over the setting, so a reader sees the old setting or the new one.
   *
   * @throws ServerClientError when the address breaks the server client's rule; nothing is written
   */
  async useServer(workspace: string, address: string): Promise<void> {
    const origin = checkedServerOrigin(address);
    const { folder, file } = await this.#place(workspace);
    const text = `${JSON.stringify({ version: settingVersion, engine: "server", address: origin }, null, 2)}\n`;
    const temporary = `${file}.${randomUUID()}.tmp`;
    await makePrivateFolder(folder);
    try {
      await writeFlushedFile(temporary, text, { mode: 0o600 });
      await renameOver(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  /** The workspace's key in the profile, which also names its server pairing in the keychain. */
  async keyOf(workspace: string): Promise<string> {
    return (await this.#place(workspace)).key;
  }

  /** Saves "This computer": removes the file without reading it, so a damaged one goes too. */
  async useThisComputer(workspace: string): Promise<void> {
    await rm((await this.#place(workspace)).file, { force: true });
  }

  async #place(workspace: string): Promise<{ key: string; folder: string; file: string }> {
    const { profile, digest } = this.#options;
    const { key, folder } = await workspaceFolders(profile, workspace, digest);
    return { key, folder, file: join(folder, messagingEngineFileName) };
  }

  #parse(text: string): MessagingEngine {
    let setting: unknown;
    try {
      setting = JSON.parse(text);
    } catch {
      // No detail: the parser's message can quote the file.
      return this.#thisComputer("it isn't JSON");
    }
    if (!isRecord(setting)) return this.#thisComputer("it isn't a setting");
    const { version, engine, address } = setting;
    if (typeof version === "number" && version > settingVersion) {
      return this.#thisComputer(`a newer Halonic wrote it (version ${version})`);
    }
    const fields = Object.keys(setting).sort().join(",");
    if (
      version !== settingVersion ||
      engine !== "server" ||
      typeof address !== "string" ||
      fields !== "address,engine,version"
    ) {
      return this.#thisComputer("it isn't a setting this version of Halonic reads");
    }
    try {
      return { kind: "server", address: checkedServerOrigin(address) };
    } catch {
      return this.#thisComputer("its server address isn't https, nor plain http to this computer");
    }
  }

  #thisComputer(reason: string): MessagingEngine {
    this.#options.warn(
      `The messaging engine setting is read as "This computer": ${reason}. ` +
        "Choose the server again to use it.",
    );
    return { kind: "this-computer" };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Only the error's name: a message may hold a path. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}
