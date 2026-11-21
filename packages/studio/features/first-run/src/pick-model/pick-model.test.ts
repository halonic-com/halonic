import type { FirstRunKeyProvider, LocalModels, ModelChoice } from "@halonicjs/app";
import { SecretText } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ModelChoiceLine,
  ModelChoicePreview,
  ModelChoiceService,
  ModelChoiceTest,
} from "../api.ts";
import { PickModel, slowLocalTestMs } from "./pick-model.ts";
import type { PickModelDone } from "./pick-model-state.ts";
import { buttonLabel, isAmber, messageText } from "./pick-model-words.ts";

const anthropicLine: ModelChoiceLine = {
  reaches: { name: "Anthropic", secrets: 1, host: undefined, local: false },
  localOnlyOff: true,
};

/** A test's answer, which the test resolves when it likes. */
function later<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** A model choice service whose keys, detection and tests a test sets. */
function fakeService(
  options: {
    saved?: FirstRunKeyProvider[];
    local?: LocalModels;
    preview?: Partial<ModelChoicePreview>;
  } = {},
) {
  const tests: {
    choice: ModelChoice;
    key: SecretText | undefined;
    answer: ReturnType<typeof later<ModelChoiceTest>>;
  }[] = [];
  const service: ModelChoiceService = {
    keySaved: async (provider) => options.saved?.includes(provider) ?? false,
    localModels: vi.fn(
      async (): Promise<LocalModels> => options.local ?? { kind: "not-found", cause: "off" },
    ),
    lineFacts: async () => anthropicLine,
    test: (choice, key) => {
      const answer = later<ModelChoiceTest>();
      tests.push({ choice, key, answer });
      return answer.promise;
    },
    preview: async () => ({ ...anthropicLine, fingerprint: "trust-1", ...options.preview }),
    continue: vi.fn(async () => ({ ok: true as const, changes: [], trusted: true })),
  };
  return { service, tests };
}

function open(service: ModelChoiceService | undefined) {
  const done = vi.fn<(result: PickModelDone) => void>();
  const report = vi.fn();
  const setTimer = (callback: () => void, delayMs: number) => {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  };
  const pick = new PickModel({ service, setTimer, done, report });
  return { pick, done, report };
}

/** Lets the service's answers reach the screen. */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

verifies("first-run.pick-model", () => {
  describe("the option ticked first", () => {
    it("is the local option when Ollama has a model and no key is saved, on llama3.2", async () => {
      const { service } = fakeService({
        local: { kind: "several", models: ["qwen3:4b", "llama3.2:latest"] },
      });
      const { pick } = open(service);
      await settle();
      expect(pick.state.picked).toBe("local");
      expect(pick.state.localModel).toBe("llama3.2:latest");
      expect(pick.state.button).toBe("test-and-continue");
    });

    it("is the key option with the saved key's provider, and the button reads Continue", async () => {
      const { service } = fakeService({
        saved: ["openai"],
        local: { kind: "one", model: "llama3.2" },
      });
      const { pick } = open(service);
      await settle();
      expect(pick.state).toMatchObject({ picked: "key", provider: "openai", button: "continue" });
      pick.replaceKey();
      expect(pick.state.button).toBe("test-and-continue");
    });

    it("is Sample answers with no model service, and the other two can't be ticked", async () => {
      const { pick, done } = open(undefined);
      pick.pick("key");
      pick.pick("local");
      expect(pick.state).toMatchObject({ picked: "sample", keysOff: true, button: "continue" });
      expect(pick.state.local.kind).toBe("desktop-only");
      await pick.press();
      expect(done).toHaveBeenCalledWith({ kind: "sample" });
    });

    it("stays where the person put it when the detection answers late", async () => {
      const { service } = fakeService({ local: { kind: "one", model: "llama3.2" } });
      const { pick } = open(service);
      pick.pick("sample");
      await settle();
      expect(pick.state.picked).toBe("sample");
    });
  });

  it("reads Check again with no local model, and asks Ollama again", async () => {
    const { service } = fakeService({ saved: ["anthropic"], local: { kind: "none-downloaded" } });
    const { pick } = open(service);
    await settle();
    pick.pick("local");
    expect(buttonLabel(pick.state.button, pick.state.busy)).toBe("Check again");
    await pick.press();
    expect(service.localModels).toHaveBeenCalledTimes(2);
  });

  it("adds the slow line to a local test after 30 seconds", async () => {
    const { service } = fakeService({ local: { kind: "one", model: "llama3.2" } });
    const { pick } = open(service);
    await settle();
    void pick.press();
    expect(buttonLabel(pick.state.button, pick.state.busy)).toBe("Loading the model…");
    await vi.advanceTimersByTimeAsync(slowLocalTestMs);
    expect(pick.state.busy).toEqual({ kind: "loading-local", slow: true });
  });

  it("tests the pasted key, then continues with the fingerprint it showed", async () => {
    const { service, tests } = fakeService();
    const { pick, done } = open(service);
    await settle();
    const pressed = pick.press(new SecretText("sk-ant-1"));
    expect(buttonLabel(pick.state.button, pick.state.busy)).toBe("Testing…");
    tests[0]?.answer.resolve({ kind: "tested", outcome: "ok", testId: "t1" });
    await pressed;
    expect(service.continue).toHaveBeenCalledWith("t1", "trust-1");
    expect(done).toHaveBeenCalledWith({ kind: "saved", changes: [], trusted: true });
  });

  it("shows a changed trust line and saves nothing until Continue", async () => {
    const { service, tests } = fakeService({ preview: { localOnlyOff: false } });
    const { pick } = open(service);
    await settle();
    const pressed = pick.press(new SecretText("sk-ant-1"));
    tests[0]?.answer.resolve({ kind: "tested", outcome: "ok", testId: "t1" });
    await pressed;
    expect(service.continue).not.toHaveBeenCalled();
    expect(pick.state).toMatchObject({ message: { kind: "line-changed" }, button: "continue" });
    expect(pick.state.line?.localOnlyOff).toBe(false);
    await pick.press();
    expect(service.continue).toHaveBeenCalledWith("t1", "trust-1");
  });

  it("keeps the newest test when an earlier one fails late", async () => {
    const { service, tests } = fakeService();
    const { pick } = open(service);
    await settle();
    const first = pick.press(new SecretText("sk-ant-1"));
    pick.chooseProvider("openai");
    const second = pick.press(new SecretText("sk-2"));
    tests[0]?.answer.resolve({ kind: "tested", outcome: "key-refused" });
    await first;
    expect(pick.state).toMatchObject({
      provider: "openai",
      busy: { kind: "testing-key" },
      message: undefined,
    });
    tests[1]?.answer.resolve({ kind: "tested", outcome: "offline" });
    await second;
    expect(pick.state.message).toEqual({ kind: "tested", outcome: "offline" });
  });

  it("keeps a running test when the ticked option is clicked again", async () => {
    const { service, tests } = fakeService();
    const { pick } = open(service);
    await settle();
    const pressed = pick.press(new SecretText("sk-ant-1"));
    pick.pick("key");
    tests[0]?.answer.resolve({ kind: "tested", outcome: "key-refused" });
    await pressed;
    expect(pick.state.message).toEqual({ kind: "tested", outcome: "key-refused" });
  });

  it("shows no credit in amber and stays, and a refused key in red", async () => {
    const { service, tests } = fakeService();
    const { pick, done } = open(service);
    await settle();
    const pressed = pick.press(new SecretText("sk-ant-1"));
    tests[0]?.answer.resolve({ kind: "tested", outcome: "no-credit" });
    await pressed;
    const message = pick.state.message;
    expect(message && isAmber(message)).toBe(true);
    expect(message && messageText(message, "anthropic")).toContain(
      "Add credit on Anthropic's site",
    );
    expect(isAmber({ kind: "tested", outcome: "key-refused" })).toBe(false);
    expect(done).not.toHaveBeenCalled();
  });

  it("reports a test that throws, and says to try again", async () => {
    const { service } = fakeService();
    service.test = async () => {
      throw new Error("bridge closed");
    };
    const { pick, report } = open(service);
    await settle();
    await pick.press(new SecretText("sk-ant-1"));
    expect(report).toHaveBeenCalledWith(new Error("bridge closed"));
    expect(pick.state).toMatchObject({ busy: undefined, message: { kind: "broke" } });
  });
});
