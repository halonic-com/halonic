import { PassThrough } from "node:stream";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { LineReader } from "./line-reader.ts";
import { SecretReader, type TerminalInput } from "./secret-reader.ts";
import { TypeAhead } from "./type-ahead.ts";

/** A terminal input that records each switch of raw mode. */
function terminal(): PassThrough & TerminalInput & { readonly rawModes: boolean[] } {
  const rawModes: boolean[] = [];
  return Object.assign(new PassThrough(), {
    rawModes,
    setRawMode: (raw: boolean) => rawModes.push(raw),
  });
}

verifies("cli.secret-prompt", () => {
  it("reads one value without its line ending, in raw mode only while it waits", async () => {
    const stdin = terminal();
    const reader = new SecretReader(stdin, () => undefined);
    const value = reader.readSecret();
    expect(stdin.rawModes).toEqual([true]);
    stdin.write("hunter2\r");
    expect(await value).toBe("hunter2");
    expect(stdin.rawModes).toEqual([true, false]);
  });

  it("lets Backspace remove the last character and ignores other control characters", async () => {
    const stdin = terminal();
    const reader = new SecretReader(stdin, () => undefined);
    const value = reader.readSecret();
    stdin.write("ab\u007f\bc\u0001d\n");
    expect(await value).toBe("cd");
  });

  it("takes an empty line as an empty value and a line ending of two characters as one", async () => {
    const stdin = terminal();
    const reader = new SecretReader(stdin, () => undefined);
    const first = reader.readSecret();
    stdin.write("\r\nnext\r");
    expect(await first).toBe("");
    expect(await reader.readSecret()).toBe("next");
  });

  it("keeps a second value that was pasted with the first for the next prompt", async () => {
    const stdin = terminal();
    const reader = new SecretReader(stdin, () => undefined);
    const first = reader.readSecret();
    stdin.write("one\rtwo\r");
    expect(await first).toBe("one");
    expect(await reader.readSecret()).toBe("two");
  });

  it("gives no value when stdin ends before anything is typed, and what was typed when it ends after", async () => {
    const empty = terminal();
    const none = new SecretReader(empty, () => undefined).readSecret();
    empty.end();
    expect(await none).toBeUndefined();
    expect(empty.rawModes).toEqual([true, false]);
    const partial = terminal();
    const some = new SecretReader(partial, () => undefined).readSecret();
    partial.end("abc");
    expect(await some).toBe("abc");
  });

  it("gives no value on Ctrl D at the start of the line", async () => {
    const stdin = terminal();
    const value = new SecretReader(stdin, () => undefined).readSecret();
    stdin.write("\u0004");
    expect(await value).toBeUndefined();
  });

  it("calls onInterrupt on Ctrl C and keeps waiting until the signal is aborted, then shows what is typed again", async () => {
    const stdin = terminal();
    let interrupted = 0;
    const stop = new AbortController();
    const reader = new SecretReader(stdin, () => interrupted++);
    let settled = false;
    const value = reader.readSecret(stop.signal).then((v) => {
      settled = true;
      return v;
    });
    stdin.write("pass\u0003more\r");
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(interrupted).toBe(1);
    expect(settled).toBe(false);
    expect(stdin.rawModes).toEqual([true]);
    stop.abort();
    expect(await value).toBeUndefined();
    expect(stdin.rawModes).toEqual([true, false]);
  });

  it("gives no value on Ctrl C when no signal could abort it", async () => {
    const stdin = terminal();
    const value = new SecretReader(stdin, () => undefined).readSecret();
    stdin.write("\u0003");
    expect(await value).toBeUndefined();
    expect(stdin.rawModes).toEqual([true, false]);
  });

  it("drops whole escape sequences, such as arrow and Delete keys, and keeps what follows", async () => {
    const stdin = terminal();
    const value = new SecretReader(stdin, () => undefined).readSecret();
    stdin.write("a\u001b[Db\u001b[3~c\u001bOHd\u001bxe\r");
    expect(await value).toBe("abcde");
  });

  it("drops an escape sequence that comes in two chunks", async () => {
    const stdin = terminal();
    const value = new SecretReader(stdin, () => undefined).readSecret();
    stdin.write("a\u001b");
    await new Promise((resolve) => setTimeout(resolve, 0));
    stdin.write("[3~b\r");
    expect(await value).toBe("ab");
  });

  it("shares what was typed ahead with the line reader, in order", async () => {
    const stdin = terminal();
    const ahead = new TypeAhead();
    const lines = new LineReader(stdin, ahead);
    const secrets = new SecretReader(stdin, () => undefined, ahead);
    stdin.write("y\nsecret\nn\n");
    expect(await lines.readLine()).toBe("y");
    expect(await secrets.readSecret()).toBe("secret");
    expect(await lines.readLine()).toBe("n");
  });

  it("gives no value at once for a second prompt after stdin ended", async () => {
    const stdin = terminal();
    const reader = new SecretReader(stdin, () => undefined);
    const first = reader.readSecret();
    stdin.end();
    expect(await first).toBeUndefined();
    expect(await reader.readSecret()).toBeUndefined();
    expect(stdin.rawModes).toEqual([true, false]);
  });

  it("goes back to showing what is typed when the signal is aborted, and reads nothing once aborted", async () => {
    const stdin = terminal();
    const reader = new SecretReader(stdin, () => undefined);
    const stop = new AbortController();
    const value = reader.readSecret(stop.signal);
    stop.abort();
    expect(await value).toBeUndefined();
    expect(stdin.rawModes).toEqual([true, false]);
    expect(await reader.readSecret(stop.signal)).toBeUndefined();
    expect(stdin.rawModes).toEqual([true, false]);
  });
});
