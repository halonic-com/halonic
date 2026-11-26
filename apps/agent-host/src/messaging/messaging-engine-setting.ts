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
export type MessagingEngine =
  | { kind: "this-computer" }
  | ({ kind: "server"; address: string } & Paired);

/** What pairing gave, kept with a server setting; a file written before S8c has neither. */
export interface Paired {
  /** The name this computer paired as, which the server's device list shows. */
  computerName?: string;
  /** When the server ends the pairing, as the server said on Allow. */
  sessionEndsAt?: string;
}

/** The server's own pattern for a device's name (`server.device-pairing`). */
export const computerNamePattern = /^[^\p{Cc}\p{Cf}]{1,80}$/u;

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
 * `{ "version": 1, "engine": "server", "address": "https://…" }`, with the
 * `computerName` and `sessionEndsAt` pairing gave when it has them. The key
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
   * Saves "Server" at `address`, with what pairing gave: a temporary file
   * with mode 0600, renamed over the setting, so a reader sees the old
   * setting or the new one. A name or an end it wouldn't read back is left out.
   *
   * @throws ServerClientError when the address breaks the server client's rule; nothing is written
   */
  async useServer(workspace: string, address: string, paired: Paired = {}): Promise<void> {
    const origin = checkedServerOrigin(address);
    const { folder, file } = await this.#place(workspace);
    const kept = pairedOf(paired.computerName, paired.sessionEndsAt);
    const setting = { version: settingVersion, engine: "server", address: origin, ...kept };
    const text = `${JSON.stringify(setting, null, 2)}\n`;
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
    const { version, engine, address, computerName, sessionEndsAt } = setting;
    if (typeof version === "number" && version > settingVersion) {
      return this.#thisComputer(`a newer Halonic wrote it (version ${version})`);
    }
    if (
      version !== settingVersion ||
      engine !== "server" ||
      typeof address !== "string" ||
      Object.keys(setting).some((field) => !settingFields.has(field))
    ) {
      return this.#thisComputer("it isn't a setting this version of Halonic reads");
    }
    try {
      return {
        kind: "server",
        address: checkedServerOrigin(address),
        ...pairedOf(computerName, sessionEndsAt),
      };
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

/** The fields a setting may hold; `computerName` and `sessionEndsAt` are optional. */
const settingFields = new Set(["version", "engine", "address", "computerName", "sessionEndsAt"]);

/** The name and the end a file holds; one that isn't a name or a date is left out, never trusted. */
function pairedOf(computerName: unknown, sessionEndsAt: unknown): Paired {
  const name = typeof computerName === "string" && computerNamePattern.test(computerName);
  const ends =
    typeof sessionEndsAt === "string" &&
    sessionEndsAt.length <= 64 &&
    Number.isFinite(Date.parse(sessionEndsAt));
  return {
    ...(name ? { computerName: computerName as string } : {}),
    ...(ends ? { sessionEndsAt: sessionEndsAt as string } : {}),
  };
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
