import { afterEach, describe, expect, it, vi } from "vitest";
import { CallChannel, StudioCallError } from "../server/call-channel.ts";
import type { NdjsonStream } from "../server/ndjson-stream.ts";
import {
  type DecideRemotely,
  quickCallLimitMs,
  studioSecrets,
  studioServices,
} from "./studio-services.ts";

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

  it("tells the observer when an approval is asked and what was decided", async () => {
    const { channel } = answeringChannel({ approved: true });
    const told: unknown[] = [];
    const { approvals } = studioServices(channel, {
      asked: (request) => told.push(["asked", request.callId]),
      ended: (callId, decision) => told.push(["ended", callId, decision]),
    });
    const request = { callId: "c1", tool: "Bash", args: {} };
    await approvals.request(request, { signal: new AbortController().signal });
    expect(told).toEqual([
      ["asked", "c1"],
      ["ended", "c1", { approved: true }],
    ]);
  });

  it("gives the observer a way to tell Studio of a remote decision, with the source set by the host", async () => {
    const { channel, lines } = answeringChannel({ status: "decided" });
    let decide: DecideRemotely | undefined;
    const { approvals } = studioServices(channel, {
      asked: (_request, decideRemotely) => {
        decide = decideRemotely;
      },
      ended: () => {},
    });
    // The fake answers every call alike, so the approval itself ends with a wrong-shaped answer.
    approvals
      .request({ callId: "c1", tool: "Bash", args: {} }, { signal: new AbortController().signal })
      .catch(() => {});
    await expect(decide?.(true)).resolves.toBe("decided");
    expect(lines[1]).toMatchObject({
      type: "call",
      method: "approvals.remote-decision",
      params: { callId: "c1", approved: true, source: "remote-device" },
    });
  });

  it("refuses a status Studio answers a remote decision with that isn't the contract's", async () => {
    const { channel } = answeringChannel({ status: "allowed" });
    let decide: DecideRemotely | undefined;
    const { approvals } = studioServices(channel, {
      asked: (_request, decideRemotely) => {
        decide = decideRemotely;
      },
      ended: () => {},
    });
    // The fake answers every call alike, so the approval itself ends with a wrong-shaped answer.
    approvals
      .request({ callId: "c1", tool: "Bash", args: {} }, { signal: new AbortController().signal })
      .catch(() => {});
    await expect(decide?.(true)).rejects.toThrow("wrong shape");
  });

  it("tells the observer a call that failed ended without a decision, and survives its faults", async () => {
    const { channel } = answeringChannel({ kind: "maybe" });
    const told: unknown[] = [];
    const { approvals } = studioServices(channel, {
      asked: () => {
        throw new Error("observer fault");
      },
      ended: (_callId, decision) => told.push(decision),
    });
    const request = { callId: "c1", tool: "Bash", args: {} };
    await expect(
      approvals.request(request, { signal: new AbortController().signal }),
    ).rejects.toThrow("wrong shape");
    expect(told).toEqual([undefined]);
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
