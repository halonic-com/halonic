import {
  type ChatRequest,
  type ChatResponse,
  type ChatStreamEvent,
  isModelCallError,
  type LlmProvider,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import {
  chatRequest,
  cutOffAnswer,
  reasonedAnswer,
  type ScriptedAnswer,
  textAnswer,
  toolAnswer,
} from "./llm-answers.ts";

/**
 * One provider under test and the model behind it. An HTTP adapter's harness
 * plays recorded vendor replies that say the same; the suite never reaches a
 * real vendor.
 */
export interface LlmProviderHarness {
  provider: LlmProvider;
  /** Makes the next call answer with `answer`. A streamed answer may come in any number of pieces. */
  answerNext(answer: ScriptedAnswer): void;
  /** Makes the next call wait until its signal aborts. A streamed call first yields `partialText`. */
  hangNext(partialText: string): void;
  /**
   * Makes the vendor refuse the next call for no reason the provider names
   * more closely, as it would a request it won't take. The provider rejects
   * with a `ModelCallError` whose reason is `refused`.
   */
  refuseNext(): void;
  /** How many calls have reached the vendor, and how many of them are still open. */
  calls(): { started: number; open: number };
}

/** Creates a provider under test with nothing scripted yet. */
export type MakeLlmProvider = () => Promise<LlmProviderHarness>;

/** What the binding says about the provider, so the suite can't skip what applies. */
export interface LlmProviderContractOptions {
  /** Whether the provider streams; the suite checks that its capabilities agree. */
  streams: boolean;
  /** Whether the vendor gives a summary of the model's reasoning, so an answer may hold one. */
  reasoning: boolean;
}

/** The contracts every {@link LlmProvider} adapter passes: `chat`, and `stream` where it streams. */
export function llmProviderContract(
  name: string,
  make: MakeLlmProvider,
  options: LlmProviderContractOptions,
): void {
  verifies("contracts.llm-provider", () => {
    describe(`LlmProvider contract: ${name}`, () => {
      capabilityCases(make, options);
      answerCases(make);
      if (options.reasoning) reasoningCases(make, options);
      failureCases(make);
    });
  });
  if (options.streams) {
    verifies("contracts.llm-stream", () => {
      describe(`LlmProvider stream contract: ${name}`, () => {
        streamAnswerCases(make);
        streamFailureCases(make);
      });
    });
  }
}

function capabilityCases(make: MakeLlmProvider, options: LlmProviderContractOptions): void {
  it("has stream() exactly when its capabilities say it streams", async () => {
    const { provider } = await make();
    expect(provider.capabilities.streaming).toBe(options.streams);
    expect(typeof provider.stream === "function").toBe(options.streams);
  });
}

function answerCases(make: MakeLlmProvider): void {
  it("answers with the scripted text, usage and finish reason", async () => {
    const harness = await make();
    for (const answer of [textAnswer, cutOffAnswer]) {
      harness.answerNext(answer);
      expectAnswer(await harness.provider.chat(chatRequest()), answer);
    }
    expect(harness.calls()).toEqual({ started: 2, open: 0 });
  });

  it("gives each tool call with its id, name and parsed arguments, in order", async () => {
    const harness = await make();
    harness.answerNext(toolAnswer);
    expectAnswer(await harness.provider.chat(chatRequest()), toolAnswer);
  });

  it("leaves the request as it was", async () => {
    const harness = await make();
    harness.answerNext(toolAnswer);
    const request = chatRequest();
    await harness.provider.chat(request);
    expect(request).toEqual(chatRequest());
  });
}

function reasoningCases(make: MakeLlmProvider, options: LlmProviderContractOptions): void {
  it("gives the model's reasoning summary", async () => {
    const harness = await make();
    harness.answerNext(reasonedAnswer);
    expectAnswer(await harness.provider.chat(chatRequest()), reasonedAnswer);
  });

  if (options.streams) {
    it("streams the reasoning summary in pieces that add up to done", async () => {
      const harness = await make();
      harness.answerNext(reasonedAnswer);
      const events = await readAll(stream(harness.provider, chatRequest()));
      expectAnswer(finalResponse(events), reasonedAnswer);
      expect(joined(events, "reasoning")).toBe(reasonedAnswer.reasoning);
    });
  }
}

function failureCases(make: MakeLlmProvider): void {
  it("rejects when the vendor refuses the call", async () => {
    const harness = await make();
    harness.refuseNext();
    await expectRefused(harness.provider.chat(chatRequest()));
    expect(harness.calls().open).toBe(0);
  });

  it("rejects an already aborted call without reaching the vendor", async () => {
    const harness = await make();
    harness.answerNext(textAnswer);
    const stop = callerStop();
    await expect(harness.provider.chat(chatRequest(AbortSignal.abort(stop)))).rejects.toBe(stop);
    expect(harness.calls().started).toBe(0);
  });

  it("rejects when the signal aborts during the call, and closes it", async () => {
    const harness = await make();
    harness.hangNext("");
    const controller = new AbortController();
    const answering = harness.provider.chat(chatRequest(controller.signal));
    await vi.waitFor(() => expect(harness.calls().started).toBe(1));
    const stop = callerStop();
    controller.abort(stop);
    await expect(answering).rejects.toBe(stop);
    expect(harness.calls().open).toBe(0);
  });
}

function streamAnswerCases(make: MakeLlmProvider): void {
  it("streams text in order and ends with one done, equal to what chat() gives", async () => {
    const harness = await make();
    harness.answerNext(textAnswer);
    const events = await readAll(stream(harness.provider, chatRequest()));
    const done = finalResponse(events);
    expect(joined(events, "text")).toBe(done.content);
    expectAnswer(done, textAnswer);

    harness.answerNext(textAnswer);
    expect(done).toEqual(await harness.provider.chat(chatRequest()));
    expect(harness.calls()).toEqual({ started: 2, open: 0 });
  });

  it("streams tool calls in pieces that add up to the calls in done", async () => {
    const harness = await make();
    harness.answerNext(toolAnswer);
    const events = await readAll(stream(harness.provider, chatRequest()));
    const done = finalResponse(events);
    expectAnswer(done, toolAnswer);
    expect(joined(events, "text")).toBe(done.content);

    const pieces = events.filter((event) => event.type === "tool-call");
    expect([...new Set(pieces.map((piece) => piece.index))].sort()).toEqual([0, 1]);
    for (const [index, call] of done.toolCalls.entries()) {
      const own = pieces.filter((piece) => piece.index === index);
      // The first piece names the call; a later piece may repeat that, never change it.
      expect(own[0]).toMatchObject({ id: call.id, name: call.name });
      for (const piece of own) {
        expect([undefined, call.id]).toContain(piece.id);
        expect([undefined, call.name]).toContain(piece.name);
      }
      const text = own.map((piece) => piece.arguments).join("");
      expect(JSON.parse(text)).toEqual(call.arguments);
    }
  });

  it("closes the call when the caller stops reading", async () => {
    const harness = await make();
    harness.answerNext(textAnswer);
    for await (const _event of stream(harness.provider, chatRequest())) break;
    expect(harness.calls()).toEqual({ started: 1, open: 0 });
  });
}

function streamFailureCases(make: MakeLlmProvider): void {
  it("ends with an error, and no done, when the vendor refuses the call", async () => {
    const harness = await make();
    harness.refuseNext();
    const events: ChatStreamEvent[] = [];
    await expectRefused(readInto(stream(harness.provider, chatRequest()), events));
    expect(events.filter((event) => event.type === "done")).toEqual([]);
    expect(harness.calls().open).toBe(0);
  });

  it("ends an already aborted stream with an error, without reaching the vendor", async () => {
    const harness = await make();
    harness.answerNext(textAnswer);
    const stop = callerStop();
    const aborted = stream(harness.provider, chatRequest(AbortSignal.abort(stop)));
    await expect(readAll(aborted)).rejects.toBe(stop);
    expect(harness.calls().started).toBe(0);
  });

  it("ends with an error, and no done, when the signal aborts mid-answer", async () => {
    const harness = await make();
    harness.hangNext("Hel");
    const controller = new AbortController();
    const events: ChatStreamEvent[] = [];
    const reading = readInto(stream(harness.provider, chatRequest(controller.signal)), events);
    await vi.waitFor(() => expect(joined(events, "text")).toBe("Hel"));
    const stop = callerStop();
    controller.abort(stop);
    await expect(reading).rejects.toBe(stop);
    expect(events.filter((event) => event.type === "done")).toEqual([]);
    expect(harness.calls().open).toBe(0);
  });

  it("ends with an error, and no done, when the caller aborts while handling a partial answer", async () => {
    const harness = await make();
    harness.hangNext("Hel");
    const controller = new AbortController();
    const stop = callerStop();
    const events: ChatStreamEvent[] = [];
    const reading = (async () => {
      for await (const event of stream(harness.provider, chatRequest(controller.signal))) {
        events.push(event);
        // The signal aborts before the provider resumes, so it must notice it already has.
        controller.abort(stop);
      }
    })();
    await expect(reading).rejects.toBe(stop);
    expect(joined(events, "text")).toBe("Hel");
    expect(events.filter((event) => event.type === "done")).toEqual([]);
    expect(harness.calls().open).toBe(0);
  });

  it("ends with an error, and no done, when the signal aborts between pieces of an answer", async () => {
    const harness = await make();
    harness.answerNext(textAnswer);
    const controller = new AbortController();
    const stop = callerStop();
    const events: ChatStreamEvent[] = [];
    const reading = (async () => {
      for await (const event of stream(harness.provider, chatRequest(controller.signal))) {
        events.push(event);
        controller.abort(stop);
      }
    })();
    await expect(reading).rejects.toBe(stop);
    expect(events.filter((event) => event.type === "done")).toEqual([]);
    expect(harness.calls().open).toBe(0);
  });
}

/**
 * Expects `call` to reject with a `ModelCallError` for `refused`. A
 * crash, such as a TypeError, is not a refusal.
 */
async function expectRefused(call: Promise<unknown>): Promise<void> {
  const error: unknown = await call.then(
    () => expect.fail("The call went through, but the vendor refused it."),
    (rejection: unknown) => rejection,
  );
  expect(isModelCallError(error), `expected a ModelCallError, got ${String(error)}`).toBe(true);
  expect((error as { reason: unknown }).reason).toBe("refused");
}

/**
 * A fresh reason for the caller to abort with. A provider rejects with this
 * very reason, so a crash on the way out doesn't pass for an abort.
 */
function callerStop(): Error {
  return new Error("The caller stopped the call.");
}

/** Checks a response says what was scripted, and that its replay is JSON data. */
function expectAnswer(response: ChatResponse, answer: ScriptedAnswer): void {
  const { replay, ...rest } = response;
  expect(rest).toEqual(answer);
  if (replay !== undefined) {
    // The engine keeps replay as JSON, so it must survive the round trip.
    expect(typeof replay.type).toBe("string");
    expect(JSON.parse(JSON.stringify(replay))).toEqual(replay);
  }
}

/** Calls `stream()`, which the capability case has already checked is there. */
function stream(provider: LlmProvider, request: ChatRequest): AsyncIterable<ChatStreamEvent> {
  const open = provider.stream as (request: ChatRequest) => AsyncIterable<ChatStreamEvent>;
  return open.call(provider, request);
}

async function readAll(events: AsyncIterable<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const read: ChatStreamEvent[] = [];
  await readInto(events, read);
  return read;
}

/** Reads into `read` as events arrive, so a caller can look before the stream ends. */
async function readInto(
  events: AsyncIterable<ChatStreamEvent>,
  read: ChatStreamEvent[],
): Promise<void> {
  for await (const event of events) read.push(event);
}

/** The response of the one `done` event, which must come last. */
function finalResponse(events: ChatStreamEvent[]): ChatResponse {
  const done = events.filter((event) => event.type === "done");
  expect(done).toHaveLength(1);
  expect(events.at(-1)).toBe(done[0]);
  return (done[0] as { response: ChatResponse }).response;
}

function joined(events: ChatStreamEvent[], type: "text" | "reasoning"): string {
  const deltas = events.map((event) =>
    (event.type === "text" || event.type === "reasoning") && event.type === type ? event.delta : "",
  );
  return deltas.join("");
}
