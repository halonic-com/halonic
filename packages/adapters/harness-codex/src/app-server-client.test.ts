import { readLines } from "@halonicjs/adapter-harness-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { AppServerClient, type AppServerMessage } from "./app-server-client.ts";

const bridgeToken = "made-up-run-token-0123456789";

/**
 * Plays `codex app-server`: reads what the client sends to its standard
 * input and prints lines on its standard output.
 */
class FakeAppServer {
  // Room for what the client writes, as a pipe has, so a write doesn't wait for the test to read it.
  readonly #stdin = new TransformStream<Uint8Array, Uint8Array>(
    {},
    new CountQueuingStrategy({ highWaterMark: 64 }),
    new CountQueuingStrategy({ highWaterMark: 64 }),
  );
  readonly #sent = readLines(this.#stdin.readable, { maxLineLength: 1_000_000 });
  #stdout: ReadableStreamDefaultController<Uint8Array> | undefined;
  readonly process = {
    stdin: this.#stdin.writable,
    stdout: new ReadableStream<Uint8Array>({ start: (controller) => (this.#stdout = controller) }),
  };

  /** The next message the client sent. */
  async received(): Promise<unknown> {
    const next = await this.#sent.next();
    if (next.done) throw new Error("The client sent nothing more.");
    return JSON.parse(next.value);
  }

  print(message: unknown): void {
    const line = typeof message === "string" ? message : JSON.stringify(message);
    this.#stdout?.enqueue(new TextEncoder().encode(`${line}\n`));
  }

  end(): void {
    this.#stdout?.close();
  }
}

function connect(onMessage: (message: AppServerMessage) => void = () => undefined) {
  const server = new FakeAppServer();
  const client = new AppServerClient({ process: server.process, onMessage, bridgeToken });
  return { server, client };
}

verifies("harness-codex.app-server-client", () => {
  describe("AppServerClient", () => {
    it("opens with initialize, then initialized, as Codex 0.166.0 expects", async () => {
      const { server, client } = connect();
      const opened = client.initialize({ name: "halonic", title: "Halonic", version: "0.1.0" });
      expect(await server.received()).toEqual({
        id: 0,
        method: "initialize",
        params: {
          clientInfo: { name: "halonic", title: "Halonic", version: "0.1.0" },
          capabilities: null,
        },
      });
      // What Codex 0.166.0 answered on 10 Nov 2026, with the folder made up.
      server.print({
        id: 0,
        result: {
          userAgent: "halonic/0.166.0 (Debian 13.0.0; x86_64) unknown (halonic; 0.1.0)",
          codexHome: "/agents/coder/settings",
          platformFamily: "unix",
          platformOs: "linux",
        },
      });
      await opened;
      expect(await server.received()).toEqual({ method: "initialized" });
    });

    it("matches each answer to its request by id, in any order", async () => {
      const { server, client } = connect();
      const thread = client.request("thread/start", { cwd: "/work" });
      const models = client.request("model/list");
      await server.received();
      await server.received();
      server.print({ id: 1, result: { data: [] } });
      server.print({ id: 0, result: { thread: { id: "thread-1" } } });
      expect(await thread).toEqual({ thread: { id: "thread-1" } });
      expect(await models).toEqual({ data: [] });
    });

    it("hands notifications and Codex's own requests on in order, and sends answers back", async () => {
      const heard: AppServerMessage[] = [];
      const { server, client } = connect((message) => heard.push(message));
      server.print({ method: "turn/started", params: { threadId: "thread-1" } });
      server.print({ id: 7, method: "item/fileChange/requestApproval", params: { itemId: "a" } });
      server.end();
      expect(await client.closed).toBeUndefined();
      expect(heard).toEqual([
        { kind: "notification", method: "turn/started", params: { threadId: "thread-1" } },
        {
          kind: "request",
          id: 7,
          method: "item/fileChange/requestApproval",
          params: { itemId: "a" },
        },
      ]);
      await client.respond(7, { result: { decision: "decline" } });
      expect(await server.received()).toEqual({ id: 7, result: { decision: "decline" } });
    });

    it("fails a request Codex refuses, with its message and code but no bridge token", async () => {
      const { server, client } = connect();
      const turn = client.request("turn/start", { threadId: "missing" });
      await server.received();
      server.print({ id: 0, error: { code: -32600, message: `no thread; token ${bridgeToken}` } });
      const error = await turn.catch((caught: unknown) => caught);
      expect(String(error)).toContain("Codex refused `turn/start`: no thread; token");
      expect(String(error)).toContain("(-32600)");
      expect(String(error)).not.toContain(bridgeToken);
    });

    it("ignores an answer to a request it didn't send", async () => {
      const heard: AppServerMessage[] = [];
      const { server, client } = connect((message) => heard.push(message));
      server.print({ id: 99, result: {} });
      server.end();
      expect(await client.closed).toBeUndefined();
      expect(heard).toEqual([]);
    });

    it("fails waiting and later requests once Codex's output ends", async () => {
      const { server, client } = connect();
      const turn = client.request("turn/start", {});
      await server.received();
      server.end();
      await expect(turn).rejects.toThrow("stopped before it answered `turn/start`");
      expect(await client.closed).toBeUndefined();
      await expect(client.request("thread/start")).rejects.toThrow("app-server has stopped");
    });

    it("stops at a line that isn't JSON-RPC, without quoting it", async () => {
      for (const line of [`token ${bridgeToken}`, "[1, 2]", '{"id": 1}', '{"result": {}}']) {
        const { server, client } = connect();
        const thread = client.request("thread/start");
        await server.received();
        server.print(line);
        const closed = await client.closed;
        expect(closed?.message).toBe(
          "Codex printed a line that isn't JSON-RPC, so Halonic stopped the run.",
        );
        await expect(thread).rejects.toBe(closed);
      }
    });

    it("stops with the error onMessage throws", async () => {
      const failed = new Error("Codex stopped with an error.");
      const { server, client } = connect(() => {
        throw failed;
      });
      server.print({ method: "turn/completed", params: {} });
      expect(await client.closed).toBe(failed);
    });

    it("fails a request it couldn't write", async () => {
      const stdin = new WritableStream<Uint8Array>({
        write() {
          throw new Error("Codex has ended.");
        },
      });
      const process = { stdin, stdout: new FakeAppServer().process.stdout };
      const client = new AppServerClient({ process, onMessage: () => undefined, bridgeToken });
      await expect(client.request("thread/start")).rejects.toThrow("Codex has ended.");
    });

    it("fails a write without the bridge token in its message", async () => {
      const stdin = new WritableStream<Uint8Array>({
        write() {
          throw new Error(`broken pipe; token ${bridgeToken}`);
        },
      });
      const process = { stdin, stdout: new FakeAppServer().process.stdout };
      const client = new AppServerClient({ process, onMessage: () => undefined, bridgeToken });
      const error = await client.notify("initialized").catch((caught: unknown) => caught);
      expect(String(error)).toContain("Halonic couldn't write to Codex: broken pipe; token");
      expect(String(error)).not.toContain(bridgeToken);
    });

    it("leaves no unhandled rejection when the output ends while a write is pending, then the write fails", async () => {
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      globalThis.process.on("unhandledRejection", onUnhandled);
      try {
        let failWrite: (error: Error) => void = () => undefined;
        const stdin = new WritableStream<Uint8Array>({
          write: () => new Promise<void>((_resolve, reject) => (failWrite = reject)),
        });
        const server = new FakeAppServer();
        const process = { stdin, stdout: server.process.stdout };
        const client = new AppServerClient({ process, onMessage: () => undefined, bridgeToken });
        const thread = client.request("thread/start");
        server.end();
        await client.closed;
        failWrite(new Error("Codex has ended."));
        await expect(thread).rejects.toThrow("Codex has ended.");
        // Node reports unhandled rejections after the microtask queue drains.
        await new Promise((resolve) => setImmediate(resolve));
        expect(unhandled).toEqual([]);
      } finally {
        globalThis.process.off("unhandledRejection", onUnhandled);
      }
    });
  });
});
