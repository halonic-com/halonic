import { KindedError } from "@halonicjs/std";

import { isRecordRefusal } from "./record-commands.ts";
import type { TauriShell } from "./shell.ts";

/**
 * The shell's workspace key command. It only reads: the key of a workspace
 * the person opened, which names the workspace's folder in the profile. It
 * answers the key and no path. A refusal has the shape of
 * a record refusal (`RecordRefusal`): `folder_not_open` for a folder that isn't open, or `io`.
 */
export const workspaceKeyCommands = {
  /** `{ workspace }` → `{ key }`: the 32 lower-case hex characters that name the workspace's folder. */
  read: "workspace_key",
} as const;

const keyPattern = /^[0-9a-f]{32}$/;

/** The error for a shell answer that is missing or has the wrong shape; `cause` is the failure behind it, if any. */
function noKeyAnswer(...cause: [unknown?]): KindedError {
  const message = "The desktop shell gave no answer to the workspace key call.";
  return cause.length === 0
    ? new KindedError("unavailable", message)
    : new KindedError("unavailable", message, { cause: cause[0] });
}

/** Turns a failed key call into an error: `denied` for a folder that isn't open, `unavailable` otherwise. */
function keyFailure(reason: unknown): KindedError {
  if (isRecordRefusal(reason) && reason.kind === "folder_not_open") {
    return new KindedError("denied", `The workspace key call was refused: ${reason.message}`, {
      cause: reason,
    });
  }
  if (isRecordRefusal(reason) && reason.kind === "io") {
    return new KindedError("unavailable", `The workspace key call failed: ${reason.message}`, {
      cause: reason,
    });
  }
  return noKeyAnswer(reason);
}

/**
 * The key of a workspace, as the shell works it out from the workspace's
 * real path. Pass it to `forConnector` in `@halonicjs/google-setup`, which
 * looks a setup up by workspace key. The page can't hash the path itself:
 * the key depends on the real path and the profile, which only the shell has.
 *
 * @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__`
 * @param workspace - the workspace folder, as the person opened it in the shell
 * @throws a `denied` error when the folder isn't open, and `unavailable` for any other failure
 */
export async function readWorkspaceKey(shell: TauriShell, workspace: string): Promise<string> {
  let answer: unknown;
  try {
    answer = await shell.invoke(workspaceKeyCommands.read, { workspace });
  } catch (reason) {
    throw keyFailure(reason);
  }
  const { key } = (answer ?? {}) as Record<string, unknown>;
  if (typeof key !== "string" || !keyPattern.test(key)) {
    throw noKeyAnswer();
  }
  return key;
}
