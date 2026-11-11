import { afterEach, describe, expect, it, vi } from "vitest";
import { CallChannel, StudioCallError } from "../server/call-channel.ts";
import type { NdjsonStream } from "../server/ndjson-stream.ts";
import { quickCallLimitMs, studioSecrets, studioServices } from "./studio-services.ts";

/** A channel whose every call Studio answers with `result`; `lines` keeps what went out. */
function answeringChannel(result: unknown): { channel: CallChannel; lines: unknown[] } {
  const lines: unknown[] = [];
  const stream: NdjsonStream = {
    send: (line) => {
      lines.push(line);
      queueMicrotask(() => channel.answer((line as { call: string }).call, { result }));
    },
    end: () => {},
    ended: new Promise(() => {}),
  };
  const channel = new CallChannel(stream);
  return { channel, lines };
}

describe("studioSecrets", () => {
  it("asks Studio only for a secret the bridge's providers name", async () => {
    const { channel, lines } = answeringChannel("test-value");
    const secrets = studioSecrets(channel, {
      anthropic: { kind: "key", secret: "anthropic-key" },
      openai: { kind: "sign-in" },
    });
    await expect(secrets.get("anthropic-key")).resolves.toBe("test-value");
    await expect(secrets.get("github-token")).resolves.toBeNull();
    expect(lines).toHaveLength(1);
  });
});

describe("studioServices", () => {
  it("refuses an answer that doesn't have the port's shape", async () => {
    const { channel } = answeringChannel({ kind: "maybe" });
    const { tools } = studioServices(channel);
    await expect(tools.check("send_mail", {})).rejects.toThrow("wrong shape");
  });

  it("passes on an answer that does", async () => {
    const { channel } = answeringChannel({ approved: false, comment: "not today" });
    const { approvals } = studioServices(channel);
    const request = { callId: "c1", tool: "Bash", args: { command: "ls" } };
    await expect(
      approvals.request(request, { signal: new AbortController().signal }),
    ).resolves.toEqual({
      approved: false,
      comment: "not today",
    });
  });

  it("gives up on a quick call Studio never answers, but lets a tool's run and an approval wait", async () => {
    vi.useFakeTimers();
    const lines: unknown[] = [];
    const channel = new CallChannel({
      send: (line) => lines.push(line),
      end: () => {},
      ended: new Promise(() => {}),
    });
    const { recorder, tools, approvals } = studioServices(channel);
    const secrets = studioSecrets(channel, { anthropic: { kind: "key", secret: "anthropic-key" } });
    const signal = new AbortController().signal;
    const quick = [
      recorder.record({} as Parameters<typeof recorder.record>[0]),
      tools.list(),
      tools.check("send_mail", {}),
      secrets.get("anthropic-key"),
    ].map((call) => expect(call).rejects.toBeInstanceOf(StudioCallError));
    let slowSettled = false;
    for (const slow of [
      tools.call("send_mail", {}, { signal }),
      approvals.request({ callId: "c1", tool: "Bash", args: {} }, { signal }),
    ]) {
      void slow.finally(() => {
        slowSettled = true;
      });
    }
    await vi.advanceTimersByTimeAsync(quickCallLimitMs);
    await Promise.all(quick);
    expect(slowSettled).toBe(false);
  });
});

afterEach(() => {
  vi.useRealTimers();
});
