import type { Readable, Writable } from "node:stream";
import {
  encodeFrame,
  type Frame,
  FrameDecoder,
  FrameKind,
  FrameStreamError,
} from "./frame-codec.ts";
import { FramedConnection, type FrameSink } from "./framed-connection.ts";

/** The two ends of the frame stream: standard input and output in `--stdio` mode. */
export interface FrameStreams {
  input: Readable;
  output: Writable;
}

/**
 * Turns the frame stream into connections and hands each one to `accept`,
 * until the stream ends. The relay opens connections with ids that only go
 * up (1, 2, 3, …), never reused. So a frame for an id it opened before but
 * that has closed since (the relay sent it before it saw the host's `reset`)
 * is dropped, while one for an id it never opened breaks the stream.
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
): Promise<Error | undefined> {
  const { input, output } = streams;
  const decoder = new FrameDecoder();
  const connections = new Map<number, FramedConnection>();
  let lastOpened = 0;
  let stopped = false;

  const sink: FrameSink = {
    send(frame, done) {
      if (stopped) done?.(new Error("The frame stream has ended."));
      else output.write(frame, done);
    },
  };

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
    if (frame.kind === FrameKind.open) {
      open(frame.connection);
      return;
    }
    const connection = connections.get(frame.connection);
    if (connection !== undefined) connection.receive(frame.kind, frame.bytes);
    else if (frame.connection > lastOpened) {
      throw new FrameStreamError(`Connection ${frame.connection} was never opened.`);
    }
  }

  return new Promise((resolve) => {
    function stop(error?: Error): void {
      if (stopped) return;
      stopped = true;
      input.off("data", onData);
      for (const connection of connections.values()) connection.destroy();
      resolve(error);
    }
    function onData(chunk: Buffer): void {
      try {
        for (const frame of decoder.push(chunk)) handle(frame);
      } catch (error) {
        stop(error instanceof Error ? error : new Error(String(error)));
      }
    }
    input.on("data", onData);
    input.once("end", () =>
      stop(
        decoder.midFrame
          ? new FrameStreamError("The input ended in the middle of a frame.")
          : undefined,
      ),
    );
    input.once("close", () => stop());
    input.on("error", (error) => stop(new Error(`The input failed: ${error.message}`)));
    output.on("error", (error) => stop(new Error(`The output failed: ${error.message}`)));
  });
}
