// @vitest-environment jsdom

import type { Provider } from "@halonicjs/format";
import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import type { ProviderCheck } from "../api.ts";
import { CheckProvider } from "./provider-check.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let element: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
});

const ollama: Provider = {
  version: 1,
  id: "ollama",
  name: "Ollama",
  type: "ollama",
  local: true,
  options: {},
};
const anthropic: Provider = {
  ...ollama,
  id: "anthropic",
  name: "Anthropic",
  type: "anthropic",
  local: false,
};
const at = () => new Date(2026, 10, 16, 10, 42);

/** A check whose answers the test hands out one at a time. */
function checkAnswering(...answers: boolean[]): ProviderCheck & { asked: number } {
  const check = {
    asked: 0,
    addressOf: ({ type }: { type: string }) => (type === "ollama" ? "localhost:11434" : undefined),
    isAnswering: async () => answers[check.asked++] ?? false,
  };
  return check;
}

async function show(check: ProviderCheck, provider: Provider, phone = false) {
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
  const page = <CheckProvider check={check} provider={provider} now={at} />;
  await act(async () =>
    root?.render(
      phone ? <PresentationProvider presentation="phone">{page}</PresentationProvider> : page,
    ),
  );
  return element;
}

const button = (view: HTMLElement) => view.querySelector("button") as HTMLButtonElement;
const settle = () => act(async () => undefined);

verifies("models.providers.check", () => {
  it("shows the result and its time after Check", async () => {
    const view = await show(checkAnswering(true), ollama);
    expect(view.textContent).toContain("Small local models can miss tool calls.");
    expect(view.textContent).not.toContain("checked");

    await act(async () => button(view).click());
    await settle();

    expect(view.textContent).toContain("Answering at localhost:11434 · checked 10:42");
    expect(view.querySelector("[role=status]")?.textContent).toBe(
      "Ollama is answering at localhost:11434, checked 10:42.",
    );
    // The filled dot stays in high contrast, in the text colour (HAL-12946).
    expect(view.querySelector(".rounded-full.size-2")?.className).toContain(
      "forced-colors:bg-[CanvasText]",
    );
  });

  it("says when the provider isn't answering, and to start it and check again", async () => {
    const view = await show(checkAnswering(false), ollama);

    await act(async () => button(view).click());
    await settle();

    expect(view.textContent).toContain(
      "Not answering at localhost:11434 · checked 10:42. Start Ollama, then check again.",
    );
    expect(view.querySelector("[role=status]")?.textContent).toBe(
      "Ollama is not answering at localhost:11434, checked 10:42. Start Ollama, then check again.",
    );
  });

  it("names LM Studio, or else the provider's own name, as the program to start", async () => {
    const check = { ...checkAnswering(false, false), addressOf: () => "localhost:1234" };
    const lmStudio = await show(check, {
      ...ollama,
      id: "studio",
      name: "My box",
      type: "lmstudio",
    });
    await act(async () => button(lmStudio).click());
    await settle();
    expect(lmStudio.textContent).toContain("Start LM Studio, then check again.");
    act(() => root?.unmount());
    element?.remove();

    const other = { ...ollama, id: "vllm", name: "vLLM", type: "openai-compatible" };
    const compatible = await show(check, other);
    await act(async () => button(compatible).click());
    await settle();
    expect(compatible.textContent).toContain("Start vLLM, then check again.");
  });

  it("keeps focus on a busy button and ignores a second click while it asks", async () => {
    let finish: (answering: boolean) => void = () => undefined;
    const check = {
      asked: 0,
      addressOf: () => "localhost:11434",
      isAnswering: () => {
        check.asked += 1;
        return new Promise<boolean>((resolve) => {
          finish = resolve;
        });
      },
    };
    const view = await show(check, ollama);
    button(view).focus();

    await act(async () => button(view).click());
    expect(button(view).textContent).toContain("Checking…");
    expect(button(view).disabled).toBe(false);
    expect(document.activeElement).toBe(button(view));
    await act(async () => button(view).click());
    expect(check.asked).toBe(1);

    await act(async () => finish(true));
    await settle();
    expect(button(view).getAttribute("aria-busy")).not.toBe("true");
  });

  it("announces a check again when the result is the same", async () => {
    const view = await show(checkAnswering(true, true), ollama);
    await act(async () => button(view).click());
    await settle();
    const line = view.querySelector("[role=status]");
    const first = line?.firstElementChild;
    await act(async () => button(view).click());
    await settle();

    expect(view.querySelector("[role=status]")).toBe(line);
    expect(line?.firstElementChild?.textContent).toBe(first?.textContent);
    expect(line?.firstElementChild).not.toBe(first);
  });

  it("keeps one status line mounted, empty until the first check", async () => {
    const view = await show(checkAnswering(true), ollama);
    const line = view.querySelector("[role=status]");
    expect(line?.textContent).toBe("");

    await act(async () => button(view).click());
    await settle();
    expect(view.querySelector("[role=status]")).toBe(line);
  });

  it("drops a result once the address changes", async () => {
    const check = checkAnswering(true);
    const view = await show(check, ollama);
    await act(async () => button(view).click());
    await settle();

    check.addressOf = () => "localhost:9999";
    await act(async () => root?.render(<CheckProvider check={check} provider={ollama} now={at} />));
    expect(view.textContent).not.toContain("Answering at");
    expect(view.querySelector("[role=status]")?.textContent).toBe("");
  });

  it("shows nothing for a cloud provider or one with no address", async () => {
    const cloud = await show(checkAnswering(), anthropic);
    expect(cloud.textContent).toBe("");
    act(() => root?.unmount());
    element?.remove();

    const noAddress = await show(checkAnswering(), { ...ollama, type: "openai-compatible" });
    expect(noAddress.textContent).toBe("");
  });

  it("on a phone shows a full-width button and the result as a chip with its line, no dot", async () => {
    const view = await show(checkAnswering(true, false), ollama, true);
    expect(button(view).className).toContain("w-full");

    await act(async () => button(view).click());
    await settle();
    expect(view.textContent).toContain("Answering");
    expect(view.textContent).toContain("at localhost:11434 · checked 10:42");
    expect(view.textContent).not.toContain("Answering at");
    expect(view.querySelector(".rounded-full.size-2")).toBeNull();
    expect(view.querySelector("[role=status]")?.textContent).toBe(
      "Ollama is answering at localhost:11434, checked 10:42.",
    );

    expect(view.textContent).not.toContain("Start Ollama");

    await act(async () => button(view).click());
    await settle();
    expect(view.textContent).toContain("Not answering");
    expect(view.textContent).toContain(
      "at localhost:11434 · checked 10:42. Start Ollama, then check again.",
    );
  });
});
