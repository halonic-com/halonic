import { type BridgeEvent, harnessBridgeTokenHeader } from "@halonicjs/ports";
import { fixedClock, fixedClockStart } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fakeProvider } from "./fake-provider.test-helper.ts";
import { fakeRun } from "./fakes.test-helper.ts";
import type { Fetch } from "./pass-through.ts";
import {
  type RunCredentialBinding,
  RunCredentials,
  type StoredRunCredential,
} from "./run-credential.ts";
import { WebHarnessBridge } from "./web-bridge.ts";

const deadline = fixedClockStart + 60_000;

/** Credentials kept in memory, as the run's Durable Object storage would keep them. */
function memoryCredentials() {
  const records = new Map<string, StoredRunCredential<RunCredentialBinding>>();
  return new RunCredentials<RunCredentialBinding>({
    clock: fixedClock(fixedClockStart, 0),
    store: {
      read: async (runId) => records.get(runId),
      create: async (record) => {
        if (records.has(record.binding.runId)) return false;
        records.set(record.binding.runId, record);
        return true;
      },
      write: async (record) => {
        records.set(record.binding.runId, record);
      },
    },
  });
}

/**
 * A Web bridge for `run_1`, which may reach Anthropic with a key, and for
 * `run_2`. It keeps what the run records and the work left for after a reply.
 */
async function open(fetch: Fetch) {
  const credentials = memoryCredentials();
  const credential = await credentials.issue({ runId: "run_1", expiresAt: deadline });
  const otherCredential = await credentials.issue({ runId: "run_2", expiresAt: deadline });
  const bridge = new WebHarnessBridge({
    credentials,
    fetch,
    secrets: { get: async () => "anthropic-test-value" },
    limits: { maxBytes: 1024, timeoutMs: 5_000 },
  });
  const recorded: BridgeEvent[] = [];
  const later: Promise<void>[] = [];
  const run = {
    ...fakeRun(),
    providers: { anthropic: { kind: "key" as const, secret: "anthropic-key" } },
    recorder: {
      record: async (event: BridgeEvent) => {
        recorded.push(event);
      },
    },
  };
  const handle = (request: Request) =>
    bridge.handle(request, { run, waitUntil: (work) => later.push(work) });
  return { handle, credential, otherCredential, recorded, later };
}

/** A program's request to the bridge at `path`. */
function programRequest(path: string, headers: Record<string, string>, body?: string) {
  return new Request(`https://bridge.halonic.invalid${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body }),
  });
}

const modelCall = JSON.stringify({
  model: "claude-sonnet-5-5",
  max_tokens: 16,
  messages: [{ role: "user", content: "Hi" }],
});

const anthropicReply = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-5-5",
  content: [{ type: "text", text: "Hello" }],
  stop_reason: "end_turn",
  usage: { input_tokens: 3, output_tokens: 2 },
};

verifies("harness-bridge.web", () => {
  it("passes a model call with the run's credential and records its spend", async () => {
    const anthropic = fakeProvider(() => Response.json(anthropicReply));
    const { handle, credential, recorded, later } = await open(anthropic.fetch);

    const reply = await handle(
      programRequest("/v1/messages", { [harnessBridgeTokenHeader]: credential }, modelCall),
    );

    expect(reply.status).toBe(200);
    expect(await reply.json()).toEqual(anthropicReply);
    await Promise.all(later);
    expect(anthropic.calls).toHaveLength(1);
    expect(recorded.map((event) => event.type)).toEqual(["llm.request", "llm.response"]);
  });

  it("refuses a request without the run's own credential, or from a web page", async () => {
    const anthropic = fakeProvider(() => Response.json(anthropicReply));
    const { handle, credential, otherCredential } = await open(anthropic.fetch);

    const none = await handle(programRequest("/v1/messages", {}, modelCall));
    const other = await handle(
      programRequest("/v1/messages", { [harnessBridgeTokenHeader]: otherCredential }, modelCall),
    );
    const page = await handle(
      programRequest(
        "/v1/messages",
        { [harnessBridgeTokenHeader]: credential, origin: "https://acme.example" },
        modelCall,
      ),
    );

    expect([none.status, other.status, page.status]).toEqual([401, 401, 403]);
    expect(anthropic.calls).toHaveLength(0);
  });

  it("answers 404 for a path it doesn't serve, only once the credential passed", async () => {
    const { handle, credential } = await open(fakeProvider(() => new Response()).fetch);

    const withCredential = await handle(
      programRequest("/v1/other", { [harnessBridgeTokenHeader]: credential }, "{}"),
    );
    const without = await handle(programRequest("/v1/other", {}, "{}"));

    expect([withCredential.status, without.status]).toEqual([404, 401]);
  });

  it("refuses a body over the limit without calling the provider", async () => {
    const anthropic = fakeProvider(() => Response.json(anthropicReply));
    const { handle, credential } = await open(anthropic.fetch);

    const reply = await handle(
      programRequest(
        "/v1/messages",
        { [harnessBridgeTokenHeader]: credential },
        JSON.stringify({ padding: "x".repeat(2048) }),
      ),
    );

    expect(reply.status).toBe(400);
    expect(anthropic.calls).toHaveLength(0);
  });
});
