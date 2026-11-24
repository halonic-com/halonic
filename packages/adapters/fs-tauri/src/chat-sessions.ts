import {
  type ChatSessions,
  isSavedChat,
  type SavedChat,
  type SavedChatSummary,
  savedChatIdPattern,
} from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { fileCommands, isFileRefusal } from "./file-commands.ts";
import type { TauriShell } from "./shell.ts";

/** A chat's file name in the chats folder: its id, then `.json`. */
const chatFile = /^([a-z0-9][a-z0-9-]{0,63})\.json$/u;

/**
 * Saved chats for the Studio desktop app (requirement `fs-tauri.chat-sessions`): every call goes
 * to one of the shell's `fs_*` commands with the folder `"chats"`, which the shell works out
 * itself as `chatsFolder()` of the workspace's folders in the profile (`@halonicjs/profile`). The
 * page names a workspace it opened, never a path. Each chat is one file, `<id>.json`.
 *
 * A chat file that can't be read (not JSON, not a saved chat, not UTF-8 text, or naming another
 * id than its file) is left out of `list`, `load` gives `null` for it, and `save` and `delete`
 * still replace or remove it.
 */
export class TauriChatSessions implements ChatSessions {
  readonly #shell: TauriShell;

  /** @param shell - the shell's IPC, built from `window.__TAURI_INTERNALS__` */
  constructor(shell: TauriShell) {
    this.#shell = shell;
  }

  async list(location: string): Promise<SavedChatSummary[]> {
    const answer = await this.#call(location, fileCommands.list, { dir: null });
    if (!Array.isArray(answer) || !answer.every((path) => typeof path === "string")) {
      throw noAnswer();
    }
    const chats: SavedChat[] = [];
    for (const entry of answer) {
      const id = chatFile.exec(entry)?.[1];
      if (id === undefined) continue;
      const chat = await this.load(location, id);
      if (chat !== null) chats.push(chat);
    }
    return chats
      .sort(
        (left, right) =>
          Date.parse(right.lastUsedAt) - Date.parse(left.lastUsedAt) ||
          (left.id < right.id ? -1 : 1),
      )
      .map(({ messages: _messages, model: _model, ...summary }) => summary);
  }

  async load(location: string, id: string): Promise<SavedChat | null> {
    if (!savedChatIdPattern.test(id)) return null;
    let answer: unknown;
    try {
      answer = await this.#call(location, fileCommands.read, { path: fileOf(id) });
    } catch (error) {
      if (error instanceof NotText) return null;
      throw error;
    }
    if (answer === null) return null;
    if (typeof answer !== "string") throw noAnswer();
    return chatIn(answer, id);
  }

  async save(location: string, chat: SavedChat): Promise<void> {
    if (!savedChatIdPattern.test(chat.id)) {
      throw new RangeError(`A saved chat's id can't be ${JSON.stringify(chat.id)}.`);
    }
    // `expected: null` replaces whatever is there, a damaged chat included.
    const text = `${JSON.stringify(chat, null, 2)}\n`;
    const answer = await this.#call(location, fileCommands.write, {
      path: fileOf(chat.id),
      text,
      expected: null,
    });
    if ((answer as { status?: unknown } | null)?.status !== "written") throw noAnswer();
  }

  async delete(location: string, id: string): Promise<void> {
    // No file can have an id that doesn't match, so there is nothing to delete.
    if (!savedChatIdPattern.test(id)) return;
    await this.#call(location, fileCommands.remove, { path: fileOf(id) });
  }

  /** Runs one command on the workspace's chats folder, turning a refusal into an error. */
  async #call(location: string, command: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.#shell.invoke(command, { workspace: location, folder: "chats", ...args });
    } catch (reason) {
      throw callFailure(reason);
    }
  }
}

function fileOf(id: string): string {
  return `${id}.json`;
}

/** The chat a file holds, when it is a saved chat with the file's own id; otherwise `null`. */
function chatIn(text: string, id: string): SavedChat | null {
  let chat: unknown;
  try {
    chat = JSON.parse(text);
  } catch {
    return null;
  }
  return isSavedChat(chat) && chat.id === id ? chat : null;
}

/** A read of a file that isn't UTF-8 text: an unreadable chat, never an error for the caller. */
class NotText extends Error {}

/** What a refused call becomes: a closed workspace `denied`, a file that isn't text {@link NotText}, anything else `unavailable`. */
function callFailure(reason: unknown): Error {
  if (!isFileRefusal(reason)) return noAnswer();
  const message = `The saved chats refused the call: ${reason.message}`;
  switch (reason.kind) {
    case "not_text":
      return new NotText(message);
    case "folder_not_open":
      return new KindedError("denied", message);
    default:
      return new KindedError("unavailable", message);
  }
}

function noAnswer(): KindedError {
  return new KindedError("unavailable", "The desktop shell gave no answer to the chats call.");
}
