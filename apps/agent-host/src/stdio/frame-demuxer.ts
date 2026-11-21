import { encodeFrame, type Frame, FrameKind, FrameStreamError } from "./frame-codec.ts";
import {
  endedReason,
  type FrameStreams,
  type HostConnection,
  hostConnectionId,
  runFrameStream,
} from "./frame-stream.ts";
import { FramedConnection } from "./framed-connection.ts";

export type { FrameStreams } from "./frame-stream.ts";

/**
 * Turns the frame stream into connections and hands each one to `accept`,
 * until the stream ends. The relay opens connections with ids that only go
 * up (1, 2, 3, …), never reused. So a frame for an id it opened before but
 * that has closed since (the relay sent it before it saw the host's `reset`)
 * is dropped, while one for an id it never opened breaks the stream.
 *
 * Id 0 is the host's own, never a client's: its frames go to `host` when
 * the host has one (its secrets channel, `--keychain-relay`), and break the
 * stream when it doesn't.
 *
 * At most `maxConnections` are open at once: `node:http` only counts the
 * sockets of `listen()`, so the cap is kept here. An `open` past the cap is
 * answered with `reset`.
 *
 * The stream ends when the input ends, closes or fails, when the output
 * fails, or when the input breaks the format: an unknown kind, a frame too
 * long, an `open` for an id that isn't new, or any other frame for an id
 * never opened. Every open connection is then dropped, and nothing more is
 * written.
 *
 * @returns settles when the stream has ended: with `undefined` at its end, or the error that ended
 *   it (a {@link FrameStreamError} when the stream broke the format)
 */
export function demuxFrames(
  streams: FrameStreams,
  accept: (connection: FramedConnection) => void,
  maxConnections: number,
  host?: HostConnection,
): Promise<Error | undefined> {
  const connections = new Map<number, FramedConnection>();
  let lastOpened = hostConnectionId;

  function open(id: number): void {
    if (id <= lastOpened) throw new FrameStreamError(`Connection ${id} isn't new.`);
    lastOpened = id;
    if (connections.size >= maxConnections) {
      sink.send(encodeFrame(id, FrameKind.reset));
      return;
    }
    const connection = new FramedConnection(id, sink);
    connections.set(id, connection);
    connection.once("close", () => connections.delete(id));
    accept(connection);
  }

  function handle(frame: Frame): void {
    if (frame.connection === hostConnectionId && host !== undefined) {
      host.receive(frame);
      return;
    }
    if (frame.kind === FrameKind.open) {
      open(frame.connection);
      return;
    }
    const connection = connections.get(frame.connection);
    if (connection !== undefined) connection.receive(frame.kind, frame.bytes);
    else if (frame.connection > lastOpened || frame.connection === hostConnectionId) {
      throw new FrameStreamError(`Connection ${frame.connection} was never opened.`);
    }
  }

  const { sink, ended } = runFrameStream(streams, handle, (reason) => {
    for (const connection of connections.values()) connection.destroy();
    host?.close(reason ?? endedReason);
  });
  host?.open(sink);
  return ended;
}
