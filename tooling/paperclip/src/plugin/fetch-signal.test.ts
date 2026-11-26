import { expect, test } from "vitest";
import { fetchHonouringSignal } from "./fetch-signal.ts";

test("a signal ends the call even when the fetch it wraps ignores it", async () => {
  const neverAnswers = () => new Promise<Response>(() => {});
  const wrapped = fetchHonouringSignal(neverAnswers);
  const call = wrapped("https://api.anthropic.com/v1/messages", {
    signal: AbortSignal.timeout(10),
  });
  await expect(call).rejects.toMatchObject({ name: "TimeoutError" });
});

test("an answer before the signal fires comes through", async () => {
  const wrapped = fetchHonouringSignal(async () => new Response("ok"));
  const response = await wrapped("https://api.anthropic.com/v1/messages", {
    signal: AbortSignal.timeout(1_000),
  });
  expect(await response.text()).toBe("ok");
});
