import { SecretText } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ollamaLine, pickRig, settled } from "./pick-model.testing.ts";

const pasted = () => new SecretText("sk-ant-acme-test-1");
const llama = { kind: "several", models: ["qwen3:8b", "llama3.2"] } as const;

verifies("first-run.pick-model-first-option", () => {
  it("ticks the key option, Anthropic, when nothing is found", async () => {
    const rig = pickRig();
    await rig.model.start();

    expect(rig.model.state).toMatchObject({ option: "key", provider: "anthropic" });
  });

  it("ticks the local option when a model is found and no key is saved", async () => {
    const rig = pickRig({ local: llama });
    await rig.model.start();

    expect(rig.model.state).toMatchObject({ option: "local", localModel: "llama3.2" });
    expect(rig.model.state.line).toEqual(ollamaLine);
  });

  it("keeps the key option, on the saved key's provider, when a key is saved", async () => {
    const rig = pickRig({ local: llama, saved: ["openai"] });
    await rig.model.start();

    expect(rig.model.state).toMatchObject({
      option: "key",
      provider: "openai",
      usesSavedKey: true,
    });
    rig.model.replaceKey();
    expect(rig.model.state.usesSavedKey).toBe(false);
  });

  it("offers only Sample answers in a window that can't test a model", async () => {
    const rig = pickRig({ noService: true });
    await rig.model.start();
    rig.model.choose("key");

    expect(rig.model.state).toMatchObject({
      option: "sample",
      keysWork: false,
      local: { kind: "desktop-only" },
    });
  });
});

verifies("first-run.pick-model-stale-answers", () => {
  it("drops a late failure from an earlier test", async () => {
    const rig = pickRig();
    await rig.model.start();
    const first = rig.model.press(pasted());
    await settled();
    rig.model.keyEdited();
    const second = rig.model.press(pasted());
    await settled();

    rig.tests[1]?.answer({ kind: "tested", outcome: "ok", testId: "test-2" });
    await second;
    rig.tests[0]?.answer({ kind: "tested", outcome: "key-refused" });
    await first;

    expect(rig.continued).toEqual([{ testId: "test-2", fingerprint: "fp-1" }]);
    expect(rig.model.state.phase).toEqual({ kind: "idle", problem: undefined });
  });

  it("drops a test's answer when the person changed the choice meanwhile", async () => {
    const rig = pickRig();
    await rig.model.start();
    const press = rig.model.press(pasted());
    await settled();
    rig.model.pickProvider("openai");

    rig.tests[0]?.answer({ kind: "tested", outcome: "offline" });
    await press;

    expect(rig.model.state).toMatchObject({
      provider: "openai",
      phase: { kind: "idle", problem: undefined },
    });
    expect(rig.continued).toEqual([]);
  });
});

verifies("first-run.pick-model-button", () => {
  it("tests, then continues when the trust line is the one shown", async () => {
    const rig = pickRig();
    await rig.model.start();
    const press = rig.model.press(pasted());
    await settled();

    expect(rig.model.state.phase).toEqual({ kind: "testing", slow: false });
    expect(rig.tests.map((test) => test.key)).toEqual(["sk-ant-acme-test-1"]);
    rig.tests[0]?.answer({ kind: "tested", outcome: "ok", testId: "test-1" });
    await press;

    expect(rig.continued).toEqual([{ testId: "test-1", fingerprint: "fp-1" }]);
    expect(rig.done).toEqual([{ kind: "model", changes: [], trusted: true }]);
  });

  it("asks again when the trust line changed after the test", async () => {
    const rig = pickRig();
    await rig.model.start();
    rig.state.preview = { reaches: undefined, localOnlyOff: true, fingerprint: undefined };
    const press = rig.model.press(pasted());
    await settled();
    rig.tests[0]?.answer({ kind: "tested", outcome: "ok", testId: "test-1" });
    await press;

    expect(rig.model.state.phase).toMatchObject({ kind: "confirm", testId: "test-1" });
    expect(rig.model.state.line).toEqual({ reaches: undefined, localOnlyOff: true });
    expect(rig.continued).toEqual([]);

    await rig.model.press(undefined);
    expect(rig.continued).toEqual([{ testId: "test-1", fingerprint: undefined }]);
  });

  it("tests the saved key by passing none", async () => {
    const rig = pickRig({ saved: ["anthropic"] });
    await rig.model.start();
    void rig.model.press(pasted());
    await settled();

    expect(rig.tests.map((test) => test.key)).toEqual([undefined]);
  });

  it("checks again instead of testing while no local model is found", async () => {
    const rig = pickRig({ local: { kind: "none-downloaded" } });
    await rig.model.start();
    rig.model.choose("local");
    rig.state.local = { kind: "one", model: "llama3.2" };
    await rig.model.press(undefined);

    expect(rig.tests).toEqual([]);
    expect(rig.model.state).toMatchObject({ local: { kind: "one" }, localModel: "llama3.2" });
  });

  it("continues with Sample answers at once", async () => {
    const rig = pickRig();
    await rig.model.start();
    rig.model.choose("sample");
    await rig.model.press(undefined);

    expect(rig.done).toEqual([{ kind: "sample" }]);
    expect(rig.model.state.line).toBeUndefined();
  });
});

verifies("first-run.pick-model-testing", () => {
  it("says a local model is still loading after 30 seconds", async () => {
    const rig = pickRig({ local: { kind: "one", model: "llama3.2" } });
    await rig.model.start();
    void rig.model.press(undefined);
    await settled();

    expect(rig.timers.map((timer) => timer.delayMs)).toEqual([30_000]);
    rig.timers[0]?.fire();
    expect(rig.model.state.phase).toEqual({ kind: "testing", slow: true });
  });

  describe("a test that didn't pass", () => {
    it("is amber when the key works but has no credit, red when refused", async () => {
      const rig = pickRig();
      await rig.model.start();
      const outcomes = ["no-credit", "key-refused"] as const;
      const tones: unknown[] = [];
      for (const outcome of outcomes) {
        const press = rig.model.press(pasted());
        await settled();
        rig.tests.at(-1)?.answer({ kind: "tested", outcome });
        await press;
        tones.push(rig.model.state.phase.kind === "idle" && rig.model.state.phase.problem);
      }

      expect(tones).toEqual([
        { kind: "tested", outcome: "no-credit", name: "Anthropic", tone: "amber" },
        { kind: "tested", outcome: "key-refused", name: "Anthropic", tone: "red" },
      ]);
      expect(rig.done).toEqual([]);
    });

    it("says what didn't save, and that the key was", async () => {
      const rig = pickRig();
      await rig.model.start();
      rig.state.saved = { ok: false, failed: "write", keySaved: true, reason: "The disk is full." };
      const press = rig.model.press(pasted());
      await settled();
      rig.tests[0]?.answer({ kind: "tested", outcome: "ok", testId: "test-1" });
      await press;

      expect(rig.model.state.phase).toMatchObject({
        kind: "idle",
        problem: { kind: "not-saved", failed: "write", keySaved: true },
      });
      expect(rig.done).toEqual([]);
    });
  });
});
