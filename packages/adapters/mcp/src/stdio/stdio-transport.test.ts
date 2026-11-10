import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { McpSession } from "../protocol/session.ts";
import { type FakeHandler, FakeProgram, type StopBehaviour } from "./fake-program.spec.ts";
import { type StdioLimits, StdioTransport } from "./stdio-transport.ts";

const limits: StdioLimits = { requestTimeoutMs: 5000, maxMessageBytes: 64, stopGraceMs: 100 };
const launch = { program: "notes-mcp", args: [], env: {}, cwd: "/workspaces/acme" };
const request = (id: number, method = "tools/list") => ({ jsonrpc: "2.0" as const, id, method });
const silent: FakeHandler = () => undefined;

function connected(handler: FakeHandler = silent, stop?: StopBehaviour) {
  const program = new FakeProgram(launch, handler, stop);
  return { program, transport: new StdioTransport(program, limits) };
}

async function collect(messages: AsyncIterable<unknown>): Promise<unknown[]> {
  const seen: unknown[] = [];
  for await (const message of messages) seen.push(message);
  return seen;
}

afterEach(() => {
  vi.useRealTimers();
});

verifies("mcp.stdio-transport", () => {
  describe("routing", () => {
    it("routes each answer to its request by id, in any order", async () => {
      const { program, transport } = connected();
      const first = collect(transport.send(request(1)));
      const second = collect(transport.send(request(2)));
      await vi.waitFor(() => expect(program.received).toHaveLength(2));
      program.send({ jsonrpc: "2.0", id: 2, result: { n: 2 } });
      program.send({ jsonrpc: "2.0", id: 1, result: { n: 1 } });
      expect(await first).toEqual([{ jsonrpc: "2.0", id: 1, result: { n: 1 } }]);
      expect(await second).toEqual([{ jsonrpc: "2.0", id: 2, result: { n: 2 } }]);
      await transport.close();
    });

    it("gives the server's own messages to the oldest waiting request", async () => {
      const { program, transport } = connected();
      const first = collect(transport.send(request(1)));
      await vi.waitFor(() => expect(program.received).toHaveLength(1));
      program.send({ jsonrpc: "2.0", id: "ping-1", method: "ping" });
      program.send({ jsonrpc: "2.0", id: 1, result: {} });
      expect(await first).toEqual([
        { jsonrpc: "2.0", id: "ping-1", method: "ping" },
        { jsonrpc: "2.0", id: 1, result: {} },
      ]);
      await transport.close();
    });

    it("answers ping and refuses other requests while no request waits", async () => {
      const { program, transport } = connected();
      program.send({ jsonrpc: "2.0", method: "notifications/message", params: {} });
      program.send({ jsonrpc: "2.0", id: 7, method: "ping" });
      program.send({ jsonrpc: "2.0", id: 8, method: "sampling/createMessage" });
      await vi.waitFor(() => expect(program.received).toHaveLength(2));
      expect(program.received).toEqual([
        { jsonrpc: "2.0", id: 7, result: {} },
        { jsonrpc: "2.0", id: 8, error: { code: -32601, message: "Method not found" } },
      ]);
      await transport.close();
    });

    it("reads a message split across chunks, and drops error output unread", async () => {
      const { program, transport } = connected();
      const answer = collect(transport.send(request(1)));
      await vi.waitFor(() => expect(program.received).toHaveLength(1));
      program.stderr.push(new TextEncoder().encode("x".repeat(10_000)));
      program.sendRaw('{"jsonrpc":"2.0",');
      program.sendRaw('"id":1,"result":{"t":"é"}}\r\n');
      expect(await answer).toEqual([{ jsonrpc: "2.0", id: 1, result: { t: "é" } }]);
      await transport.close();
    });
  });

  describe("ending the session", () => {
    it("ends the session and stops the program on a line above the limit", async () => {
      const { program, transport } = connected();
      const answer = collect(transport.send(request(1)));
      program.sendRaw("x".repeat(65));
      await expect(answer).rejects.toMatchObject({ code: "unexpected-response" });
      await expect(collect(transport.send(request(2)))).rejects.toThrow("larger than 64 bytes");
      await transport.close();
      expect(program.running).toBe(false);
    });

    it("ends the session on a line that isn't JSON", async () => {
      const { program, transport } = connected();
      const answer = collect(transport.send(request(1)));
      program.sendRaw("Server started!\n");
      await expect(answer).rejects.toMatchObject({ code: "unexpected-response" });
      await transport.close();
    });

    it("fails a request the program doesn't answer in time, initialize included, and stops it", async () => {
      vi.useFakeTimers();
      const { program, transport } = connected();
      const session = new McpSession(transport, { clientInfo: { name: "halonic", version: "0" } });
      const opening = session.initialize();
      const failure = expect(opening).rejects.toThrow(
        "The program didn't answer initialize within 5 seconds, so it was stopped.",
      );
      await vi.advanceTimersByTimeAsync(5000);
      await failure;
      expect(program.stopSteps).toEqual(["end-input"]);
    });

    it("rejects a waiting call when the transport closes, instead of leaving it hanging", async () => {
      const { program, transport } = connected();
      const call = collect(transport.send(request(1, "tools/call")));
      await vi.waitFor(() => expect(program.received).toHaveLength(1));
      await transport.close();
      await expect(call).rejects.toThrow("The connection to the program was closed.");
      await transport.close();
    });

    it("fails a waiting request when the program ends on its own", async () => {
      const { program, transport } = connected();
      const call = collect(transport.send(request(1, "tools/call")));
      await vi.waitFor(() => expect(program.received).toHaveLength(1));
      program.exit(1);
      await expect(call).rejects.toThrow("The program stopped.");
      await transport.close();
    });

    it("closes the input, then asks the program to end, then forces it", async () => {
      vi.useFakeTimers();
      const stubborn = { endsOnInputEnd: false, endsOnTerminate: false };
      const { program, transport } = connected(silent, stubborn);
      const closing = transport.close();
      await vi.advanceTimersByTimeAsync(100);
      expect(program.stopSteps).toEqual(["end-input", "terminate"]);
      await vi.advanceTimersByTimeAsync(100);
      await closing;
      expect(program.stopSteps).toEqual(["end-input", "terminate", "kill"]);
      expect(program.running).toBe(false);
    });
  });
});
