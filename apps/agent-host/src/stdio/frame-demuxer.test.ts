import { afterEach, describe, expect, it, vi } from "vitest";
import {
  encodeFrame,
  type Frame,
  FrameKind,
  FrameStreamError,
  maxFrameBytes,
} from "./frame-codec.ts";
import { demuxFrames } from "./frame-demuxer.ts";
import { type FramedConnection, maxUnreadBytes } from "./framed-connection.ts";
import { TestRelay } from "./relay.test-helper.ts";

/** A relay talking to the demuxer, with the connections the host side accepted. */
function demuxed(maxConnections = 4) {
  const relay = new TestRelay();
  const accepted: FramedConnection[] = [];
  const ended = demuxFrames(
    relay.streams,
    (connection) => accepted.push(connection),
    maxConnections,
  );
  return { relay, accepted, ended };
}

/** Lets the in-memory streams pass on what was written. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

const kinds = (frames: Frame[]) => frames.map((frame) => [frame.connection, frame.kind]);

afterEach(() => {
  vi.useRealTimers();
});

describe("demuxFrames", () => {
  it("hands each opened connection over and carries its bytes both ways", async () => {
    const { relay, accepted } = demuxed();
    relay.sendFrame(1, FrameKind.open);
    relay.sendFrame(1, FrameKind.data, Buffer.from("ping"));
    await settle();
    const [connection] = accepted;
    expect(connection?.id).toBe(1);
    expect(connection?.read()?.toString()).toBe("ping");

    connection?.end("pong");
    await settle();
    expect(relay.received.map((frame) => [frame.kind, frame.bytes.toString()])).toEqual([
      [FrameKind.data, "pong"],
      [FrameKind.end, ""],
    ]);
  });

  it("splits a write into frames of at most 64 KiB", async () => {
    const { relay, accepted } = demuxed();
    relay.sendFrame(1, FrameKind.open);
    await settle();
    accepted[0]?.write(Buffer.alloc(maxFrameBytes * 2 + 1));
    await settle();
    expect(relay.received.map((frame) => frame.bytes.length)).toEqual([
      maxFrameBytes,
      maxFrameBytes,
      1,
    ]);
  });

  it("ends the connection's input on the relay's end, and leaves its output open", async () => {
    const { relay, accepted } = demuxed();
    relay.sendFrame(1, FrameKind.open);
    relay.sendFrame(1, FrameKind.end);
    await settle();
    const connection = accepted[0];
    connection?.resume();
    await settle();
    expect(connection?.readableEnded).toBe(true);
    expect(connection?.writable).toBe(true);
  });

  it("drops a connection the relay reset, without a reset back", async () => {
    const { relay, accepted } = demuxed();
    relay.sendFrame(1, FrameKind.open);
    relay.sendFrame(1, FrameKind.reset);
    await settle();
    expect(accepted[0]?.destroyed).toBe(true);
    expect(relay.received).toEqual([]);
  });

  it("tells the relay to drop a connection the host dropped", async () => {
    const { relay, accepted } = demuxed();
    relay.sendFrame(1, FrameKind.open);
    await settle();
    accepted[0]?.destroy();
    await settle();
    expect(kinds(relay.received)).toEqual([[1, FrameKind.reset]]);
  });

  it("ignores frames the relay sent before it saw the reset, and goes on", async () => {
    const { relay, accepted } = demuxed();
    relay.sendFrame(1, FrameKind.open);
    await settle();
    accepted[0]?.destroy();
    relay.sendFrame(1, FrameKind.data, Buffer.from("late"));
    relay.sendFrame(1, FrameKind.end);
    relay.sendFrame(2, FrameKind.open);
    await settle();
    expect(accepted.map((connection) => connection.id)).toEqual([1, 2]);
  });

  it("answers an open past the cap with reset, and ignores what follows on it", async () => {
    const { relay, accepted } = demuxed(2);
    for (const id of [1, 2, 3]) relay.sendFrame(id, FrameKind.open);
    relay.sendFrame(3, FrameKind.data, Buffer.from("GET / HTTP/1.1\r\n"));
    await settle();
    expect(accepted.map((connection) => connection.id)).toEqual([1, 2]);
    expect(kinds(relay.received)).toEqual([[3, FrameKind.reset]]);

    // A closed connection frees its place.
    accepted[0]?.destroy();
    await settle();
    relay.sendFrame(4, FrameKind.open);
    await settle();
    expect(accepted.map((connection) => connection.id)).toEqual([1, 2, 4]);
  });

  it("resets a connection on which more than 4 MiB wait unread", async () => {
    const { relay, accepted } = demuxed();
    relay.sendFrame(1, FrameKind.open);
    const chunk = Buffer.alloc(maxFrameBytes);
    for (let sent = 0; sent <= maxUnreadBytes; sent += chunk.length) {
      relay.sendFrame(1, FrameKind.data, chunk);
    }
    await settle();
    expect(accepted[0]?.destroyed).toBe(true);
    expect(kinds(relay.received)).toEqual([[1, FrameKind.reset]]);
  });

  it("emits timeout after the time set with setTimeout without a frame either way", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { relay, accepted } = demuxed();
    relay.sendFrame(1, FrameKind.open);
    await settle();
    const connection = accepted[0];
    const timedOut = vi.fn();
    connection?.setTimeout(1_000, timedOut);
    vi.advanceTimersByTime(900);
    relay.sendFrame(1, FrameKind.data, Buffer.from("x"));
    await settle();
    vi.advanceTimersByTime(900);
    expect(timedOut).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(timedOut).toHaveBeenCalledOnce();
  });

  it("ends when the input ends, drops every connection and writes nothing more", async () => {
    const { relay, accepted, ended } = demuxed();
    relay.sendFrame(1, FrameKind.open);
    relay.streams.input.end();
    expect(await ended).toBeUndefined();
    expect(accepted[0]?.destroyed).toBe(true);
    expect(relay.received).toEqual([]);
  });

  it.each([
    [
      "an open for an id that isn't new",
      [encodeFrame(2, FrameKind.open), encodeFrame(2, FrameKind.open)],
    ],
    ["an open for a lower id", [encodeFrame(2, FrameKind.open), encodeFrame(1, FrameKind.open)]],
    ["a frame for an id never opened", [encodeFrame(5, FrameKind.data, Buffer.from("x"))]],
    ["an unknown kind", [Buffer.from([0, 0, 0, 1, 0, 0, 0, 0, 0])]],
  ])("breaks on %s, and drops every connection", async (_name, frames) => {
    const { relay, accepted, ended } = demuxed();
    relay.sendFrame(1, FrameKind.open);
    for (const frame of frames) relay.send(frame);
    expect(await ended).toBeInstanceOf(FrameStreamError);
    expect(accepted[0]?.destroyed).toBe(true);
  });

  it("breaks when the input ends in the middle of a frame", async () => {
    const { relay, ended } = demuxed();
    relay.send(encodeFrame(1, FrameKind.open).subarray(0, 4));
    relay.streams.input.end();
    expect(await ended).toBeInstanceOf(FrameStreamError);
  });
});
