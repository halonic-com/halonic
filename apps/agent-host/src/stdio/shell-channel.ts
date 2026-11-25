import { encodeFrame, type Frame, FrameKind } from "./frame-codec.ts";
import { type HostConnection, hostConnectionId } from "./frame-stream.ts";
import type { FrameSink } from "./framed-connection.ts";

/** The one notice Studio's shell sends unasked: the person opened a folder. */
export interface OpenWorkspaceNotice {
  op: "open_workspace";
  folder: string;
}

/**
 * The host's answer to an {@link OpenWorkspaceNotice}, sent once it has
 * added the folder or refused it, so the shell can wait for it before its
 * next request. It names the folder as the notice did, and nothing else.
 */
export interface NoticedAnswer {
  op: "noticed";
  folder: string;
}

/**
 * The host's connection id 0 to Studio's shell, which carries two things
 * (requirement `agent-host.opened-workspaces`):
 *
 * - the host's secret requests and the shell's answers, which go to
 *   `secrets` unchanged (requirement `agent-host.keychain-secrets`);
 * - the shell's {@link OpenWorkspaceNotice}s, which go to `openWorkspace`,
 *   each answered with a {@link NoticedAnswer} once it is handled.
 *
 * A notice has exactly the fields `op` and `folder`, and an answer never
 * has `op`, so the two can't be taken for each other. Anything that isn't a
 * notice goes to `secrets`, which stops the host on what isn't an answer to
 * its waiting request, as before. The answer has `op` too, but it goes from
 * the host to the shell, where a secret request is never `noticed`. Only the
 * shell writes on this channel: the relay never gives id 0 to a page's
 * connection.
 */
export class ShellChannel implements HostConnection {
  readonly #secrets: HostConnection;
  readonly #openWorkspace: (folder: string) => void;
  #sink: FrameSink | undefined;

  /** @param openWorkspace - takes each folder the shell names; it reports its own refusals */
  constructor(secrets: HostConnection, openWorkspace: (folder: string) => void) {
    this.#secrets = secrets;
    this.#openWorkspace = openWorkspace;
  }

  open(sink: FrameSink): void {
    this.#sink = sink;
    this.#secrets.open(sink);
  }

  receive(frame: Frame): void {
    const notice = openWorkspaceNoticeOf(frame);
    if (notice === undefined) {
      this.#secrets.receive(frame);
      return;
    }
    this.#openWorkspace(notice.folder);
    // The folder is added (or refused) before the shell hears back, so its next request finds it.
    const answer: NoticedAnswer = { op: "noticed", folder: notice.folder };
    this.#sink?.send(
      encodeFrame(hostConnectionId, FrameKind.data, Buffer.from(JSON.stringify(answer), "utf8")),
    );
  }

  close(reason: Error): void {
    this.#secrets.close(reason);
  }
}

/** The notice `frame` holds, or `undefined` when it holds anything else. */
export function openWorkspaceNoticeOf(frame: Frame): OpenWorkspaceNotice | undefined {
  if (frame.kind !== FrameKind.data) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(frame.bytes.toString("utf8"));
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const fields = Object.keys(value).sort();
  if (fields.length !== 2 || fields[0] !== "folder" || fields[1] !== "op") return undefined;
  const { op, folder } = value as Record<string, unknown>;
  if (op !== "open_workspace" || typeof folder !== "string" || folder === "") return undefined;
  return { op, folder };
}
