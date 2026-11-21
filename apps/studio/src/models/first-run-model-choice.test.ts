import { ModelCallError } from "@halonicjs/ports";
import { SecretText } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { acmeFiles, acmeFolder, neverAnswers } from "./first-run-model-choice.testing.ts";

const anthropic = { kind: "key", provider: "anthropic" } as const;
const pasted = "sk-ant-acme-test-1";
const key = () => new SecretText(`${pasted}\n`);

async function passedTest(folder: ReturnType<typeof acmeFolder>) {
  const tested = await folder.service.test(anthropic, key());
  if (tested.kind !== "tested" || tested.outcome !== "ok") throw new Error("the test didn't pass");
  return tested.testId;
}

verifies("studio.first-run-model-test", () => {
  it("calls the provider a run would use, with only the pasted key", async () => {
    const folder = acmeFolder();

    expect(await folder.service.test(anthropic, key())).toMatchObject({ outcome: "ok" });

    expect(folder.calls).toHaveLength(1);
    const [call] = folder.calls;
    expect(call?.file).toMatchObject({
      id: "anthropic",
      type: "anthropic",
      secret: "anthropic-api-key",
    });
    expect(call?.file.baseUrl).toBeUndefined();
    expect(call?.key).toBe(pasted);
    expect(call?.request.model).toBe("claude-haiku-5-5");
    expect(folder.timers.map((timer) => timer.delayMs)).toEqual([]);
  });

  it("cuts a key's call off at 5 seconds and a local model's at 180", async () => {
    const folder = acmeFolder();
    folder.state.answer = neverAnswers;

    const keyTest = folder.service.test(anthropic, key());
    await vi.waitFor(() => expect(folder.timers.map((timer) => timer.delayMs)).toEqual([5_000]));
    folder.timers[0]?.fire();
    expect(await keyTest).toEqual({ kind: "tested", outcome: "provider-error" });

    const localTest = folder.service.test({ kind: "local", model: "llama3.2" });
    await vi.waitFor(() => expect(folder.timers.map((timer) => timer.delayMs)).toEqual([180_000]));
    folder.timers[0]?.fire();
    expect(await localTest).toEqual({ kind: "tested", outcome: "local-not-answering" });
  });

  it("calls nothing for what isn't a key, or a provider file it can't use", async () => {
    const folder = acmeFolder();
    expect(
      await folder.service.test(anthropic, new SecretText("https://console.anthropic.com")),
    ).toEqual({ kind: "not-a-key", problem: { kind: "url", keyStart: "sk-ant-" } });

    const own = acmeFolder({
      files: {
        ...acmeFiles,
        "providers/anthropic.yaml":
          "id: anthropic\ntype: anthropic\nbaseUrl: https://proxy.acme.test\nsecret: k\n",
      },
    });
    expect(await own.service.test(anthropic, key())).toEqual({
      kind: "files",
      problem: { kind: "provider-differs", file: "providers/anthropic.yaml" },
    });
    expect([...folder.calls, ...own.calls]).toEqual([]);
  });
});

verifies("studio.first-run-key-after-test", () => {
  it("saves nothing after a failed test, which gives no id", async () => {
    const folder = acmeFolder();
    folder.state.answer = async () => {
      throw new ModelCallError("key-refused", "Anthropic didn't accept the key.");
    };

    expect(await folder.service.test(anthropic, key())).toEqual({
      kind: "tested",
      outcome: "key-refused",
    });
    expect(await folder.service.continue("test-1", undefined)).toMatchObject({
      ok: false,
      failed: "no-test",
    });
    expect(folder.stored.size).toBe(0);
    expect(folder.steps).toEqual([]);
  });

  it("saves the trimmed key once, under the provider's secret name", async () => {
    const folder = acmeFolder();
    const testId = await passedTest(folder);

    expect(folder.stored.size).toBe(0);
    expect(await folder.service.continue(testId, undefined)).toMatchObject({ ok: true });
    expect([...folder.stored]).toEqual([["anthropic-api-key", pasted]]);

    expect(await folder.service.continue(testId, undefined)).toMatchObject({
      ok: false,
      failed: "no-test",
    });
  });

  it("drops a test's key when a newer test starts", async () => {
    const folder = acmeFolder();
    const first = await passedTest(folder);
    folder.state.answer = async () => {
      throw new ModelCallError("offline", "No network.");
    };
    await folder.service.test(anthropic, key());

    expect(await folder.service.continue(first, undefined)).toMatchObject({ failed: "no-test" });
    expect(await folder.service.preview(first)).toBeUndefined();
    expect(folder.stored.size).toBe(0);
  });
});

verifies("studio.first-run-key-after-test", () => {
  it("keeps no key from a test that ends after a newer one started", async () => {
    const folder = acmeFolder();
    let answerFirst: () => void = () => {};
    folder.state.answer = () =>
      new Promise((resolve) => {
        answerFirst = () => resolve(replyOf("refund"));
      });
    const first = folder.service.test(anthropic, key());
    await vi.waitFor(() => expect(folder.calls).toHaveLength(1));
    folder.state.answer = async () => replyOf("refund");
    const second = await folder.service.test(anthropic, key());
    answerFirst();

    expect(await first).toEqual({ kind: "superseded" });
    expect(second).toMatchObject({ outcome: "ok" });
    if (second.kind !== "tested" || second.outcome !== "ok") throw new Error("no id");
    expect(await folder.service.continue(second.testId, undefined)).toMatchObject({ ok: true });
  });

  it("gives no outcome for a test that fails after a newer one started", async () => {
    const folder = acmeFolder();
    let failFirst: () => void = () => {};
    folder.state.answer = () =>
      new Promise((_, reject) => {
        failFirst = () => reject(new ModelCallError("offline", "No network."));
      });
    const first = folder.service.test(anthropic, key());
    await vi.waitFor(() => expect(folder.calls).toHaveLength(1));
    folder.state.answer = async () => replyOf("refund");
    const second = await folder.service.test(anthropic, key());
    failFirst();

    expect(await first).toEqual({ kind: "superseded" });
    expect(second).toMatchObject({ outcome: "ok" });
  });
});

verifies("studio.first-run-key-never-shown", () => {
  it("keeps the key out of every answer, passed or failed", async () => {
    const folder = acmeFolder();
    const answers: unknown[] = [];
    answers.push(await folder.service.test(anthropic, new SecretText(`${pasted} extra`)));
    folder.state.answer = async () => {
      throw new ModelCallError("out-of-credit", "No credit.");
    };
    answers.push(await folder.service.test(anthropic, key()));
    folder.state.answer = async () => replyOf(pasted);
    const testId = await passedTest(folder);
    answers.push(await folder.service.preview(testId));
    folder.state.failKey = new Error(`The keychain refused ${pasted}`);
    answers.push(await folder.service.continue(testId, undefined));

    expect(answers[3]).toMatchObject({ ok: false, failed: "key", keySaved: false });
    for (const answer of answers) expect(JSON.stringify(answer)).not.toContain(pasted);
  });
});

function replyOf(content: string) {
  return {
    content,
    toolCalls: [],
    usage: { inputTokens: 40, outputTokens: 1 },
    finishReason: "stop" as const,
  };
}
