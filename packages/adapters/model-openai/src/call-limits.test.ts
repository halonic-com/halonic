import { type ChatStreamEvent, isModelCallError } from "@halonicjs/ports";
import { chatRequest } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OpenAiCompatibleProvider } from "./openai-provider.ts";
import { ScriptedVendor } from "./test/scripted-vendor.ts";

/** A provider with short limits in front of a fresh scripted vendor. */
function providerWith() {
  const vendor = new ScriptedVendor();
  const provider = new OpenAiCompatibleProvider({
    id: "acme",
    type: "openai-compatible",
    baseUrl: "http://acme.test/v1",
    http: vendor,
    limits: { responseTimeoutMs: 2_000, idleTimeoutMs: 500 },
  });
  return { vendor, provider };
}

/** Reads a whole stream, and gives the pieces that arrived and what it failed with. */
async function readStream(provider: OpenAiCompatibleProvider) {
  const events: ChatStreamEvent[] = [];
  try {
    for await (const event of provider.stream(chatRequest())) events.push(event);
  } catch (error) {
    return { events, error };
  }
  return { events, error: undefined };
}

/** Lets the call start, then moves the clock on by `ms`. */
async function after<T>(ms: number, pending: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(ms);
  return pending;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

verifies("model-openai.call-limits", () => {
  it("ends a call whose reply doesn't start in time as offline, and closes it", async () => {
    const { vendor, provider } = providerWith();
    vendor.hangNext();
    const error = await after(
      2_000,
      provider.chat(chatRequest()).catch((thrown: unknown) => thrown),
    );

    expect(isModelCallError(error) && error.reason).toBe("offline");
    expect((error as Error).message).toBe("acme at acme.test didn't answer within 2 seconds");
    expect(vendor.calls()).toEqual({ started: 1, open: 0 });
  });

  it("ends a reply that goes silent for longer than the idle limit", async () => {
    const { vendor, provider } = providerWith();
    vendor.stallNext(200);
    const error = await after(
      500,
      provider.chat(chatRequest()).catch((thrown: unknown) => thrown),
    );

    expect(isModelCallError(error) && error.reason).toBe("offline");
    expect((error as Error).message).toBe("acme at acme.test sent nothing for 0.5 seconds");
    expect(vendor.calls().open).toBe(0);
  });

  it("ends a stream that goes silent, after the pieces that came, and with no done", async () => {
    const { vendor, provider } = providerWith();
    vendor.hangNext("Hel");
    const { events, error } = await after(500, readStream(provider));

    expect(events).toEqual([{ type: "text", delta: "Hel" }]);
    expect(isModelCallError(error) && error.reason).toBe("offline");
    expect((error as Error).message).toMatch(/sent nothing for 0.5 seconds$/);
    expect(vendor.calls().open).toBe(0);
  });

  it("waits ten minutes for a reply when it is given no limits", async () => {
    const vendor = new ScriptedVendor();
    const provider = new OpenAiCompatibleProvider({
      id: "acme",
      type: "openai-compatible",
      baseUrl: "http://acme.test/v1",
      http: vendor,
    });
    vendor.hangNext();
    let settled = false;
    const pending = provider.chat(chatRequest()).catch((thrown: unknown) => thrown);
    void pending.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(10 * 60_000 - 1);
    expect(settled).toBe(false);
    const error = await after(1, pending);
    expect((error as Error).message).toMatch(/didn't answer within 600 seconds$/);
  });

  it("still fails with the caller's own reason when the caller stops first", async () => {
    const { vendor, provider } = providerWith();
    vendor.hangNext();
    const controller = new AbortController();
    const reason = new Error("stopped by the run");
    const pending = provider.chat({ ...chatRequest(), signal: controller.signal });
    await vi.advanceTimersByTimeAsync(1_000);
    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
    expect(vendor.calls().open).toBe(0);
  });
});
