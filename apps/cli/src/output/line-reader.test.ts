import { PassThrough } from "node:stream";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { LineReader } from "./line-reader.ts";

verifies("cli.questions", () => {
  it("reads one line per answer, typed one at a time", async () => {
    const stdin = new PassThrough();
    const reader = new LineReader(stdin);
    const first = reader.readLine();
    stdin.write("y\n");
    expect(await first).toBe("y");
    const second = reader.readLine();
    stdin.write("yes\r\n");
    expect(await second).toBe("yes");
  });

  it("keeps a second answer that came with the first for the next question", async () => {
    const stdin = new PassThrough();
    const reader = new LineReader(stdin);
    stdin.write("y\nn\n");
    expect(await reader.readLine()).toBe("y");
    expect(await reader.readLine()).toBe("n");
  });

  it("waits for the end of a line that comes in pieces", async () => {
    const stdin = new PassThrough();
    const reader = new LineReader(stdin);
    const answer = reader.readLine();
    stdin.write("y");
    stdin.write("es\n");
    expect(await answer).toBe("yes");
  });

  it("gives the text before the end of stdin, then nothing", async () => {
    const stdin = new PassThrough();
    const reader = new LineReader(stdin);
    stdin.end("y");
    expect(await reader.readLine()).toBe("y");
    expect(await reader.readLine()).toBeUndefined();
  });

  it("pauses stdin between questions, so it doesn't hold the process open", async () => {
    const stdin = new PassThrough();
    const reader = new LineReader(stdin);
    stdin.write("y\n");
    await reader.readLine();
    expect(stdin.isPaused()).toBe(true);
    expect(stdin.listenerCount("data")).toBe(0);
  });

  it("stops reading when the signal is aborted, and keeps what was typed for the next line", async () => {
    const stdin = new PassThrough();
    const reader = new LineReader(stdin);
    const controller = new AbortController();
    const answer = reader.readLine(controller.signal);
    stdin.write("y");
    controller.abort();
    expect(await answer).toBeUndefined();
    expect(stdin.isPaused()).toBe(true);
    expect(stdin.listenerCount("data")).toBe(0);
    stdin.write("es\n");
    expect(await reader.readLine()).toBe("yes");
  });
});
