import type { Readable, Writable } from "node:stream";
import { type Frame, FrameDecoder, FrameStreamError } from "./frame-codec.ts";
import type { FrameSink } from "./framed-connection.ts";

/** The two ends of the frame stream: standard input and output. */
export interface FrameStreams {
  input: Readable;
  output: Writable;
}

/**
 * The host's own end of the frame stream, on connection id 0: the relay
 * never opens that id for a client (requirement
 * `studio.src-tauri.crates.agent-host.host-secrets-channel`). The host
 * sends on it, and the shell answers there.
 */
export interface HostConnection {
  /** Starts sending through `sink`, once the stream runs. */
  open(sink: FrameSink): void;
  /**
   * Takes a frame the shell sent on id 0.
   *
   * @throws {FrameStreamError} when the frame isn't one the host waits for; the stream then ends
   */
  receive(frame: Frame): void;
  /** The stream has ended, for `reason`: nothing more goes either way. */
  close(reason: Error): void;
}

/** A frame stream that runs: where to write frames, and when it ends. */
export interface RunningFrameStream {
  /** Writes one frame to the output while the stream runs; after its end, `done` gets an error. */
  sink: FrameSink;
  /**
   * Settles when the stream has ended: with `undefined` at the input's end,
   * or the error that ended it (a {@link FrameStreamError} when the input
   * broke the format).
   */
  ended: Promise<Error | undefined>;
}

/**
 * Reads `streams.input` as frames and hands each one to `handle`, until the
 * input ends, closes or fails, the output fails, or `handle` throws. Then it
 * runs `stop` once and writes nothing more.
 *
 * @param handle - takes each frame in order; throwing ends the stream with that error
 * @param stop - runs once when the stream ends, with the reason
 */
export function runFrameStream(
  streams: FrameStreams,
  handle: (frame: Frame) => void,
  stop: (reason: Error | undefined) => void,
): RunningFrameStream {
  const { input, output } = streams;
  const decoder = new FrameDecoder();
  let stopped = false;

  const sink: FrameSink = {
    send(frame, done) {
      if (stopped) done?.(new Error("The frame stream has ended."));
      else output.write(frame, done);
    },
  };

  const ended = new Promise<Error | undefined>((resolve) => {
    function end(error?: Error): void {
      if (stopped) return;
      stopped = true;
      input.off("data", onData);
      stop(error);
      resolve(error);
    }
    function onData(chunk: Buffer): void {
      try {
        for (const frame of decoder.push(chunk)) handle(frame);
      } catch (error) {
        end(error instanceof Error ? error : new Error(String(error)));
      }
    }
    input.on("data", onData);
    input.once("end", () =>
      end(
        decoder.midFrame
          ? new FrameStreamError("The input ended in the middle of a frame.")
          : undefined,
      ),
    );
    input.once("close", () => end());
    input.on("error", (error) => end(new Error(`The input failed: ${error.message}`)));
    output.on("error", (error) => end(new Error(`The output failed: ${error.message}`)));
  });

  return { sink, ended };
}

/**
 * Carries only the host's own connection over `streams`: what a host serving
 * on loopback reads and writes on its standard input and output after the
 * handshake, where the shell opens no connections. Any frame on another id
 * breaks the stream.
 *
 * @returns settles when the stream has ended, as {@link RunningFrameStream.ended}
 */
export function carryHostConnection(
  streams: FrameStreams,
  host: HostConnection,
): Promise<Error | undefined> {
  const { sink, ended } = runFrameStream(
    streams,
    (frame) => {
      if (frame.connection !== hostConnectionId) {
        throw new FrameStreamError(`Connection ${frame.connection} was never opened.`);
      }
      host.receive(frame);
    },
    (reason) => host.close(reason ?? endedReason),
  );
  host.open(sink);
  return ended;
}

/** The connection id that is the host's own. */
export const hostConnectionId = 0;

/** Why the host's connection closed when the stream simply ended. */
export const endedReason = new Error("The frame stream has ended.");
