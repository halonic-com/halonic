import { describe, expect, it } from "vitest";
import { CallChannel } from "../server/call-channel.ts";
import type { NdjsonStream } from "../server/ndjson-stream.ts";
import { studioSecrets, studioServices } from "./studio-services.ts";

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
});
