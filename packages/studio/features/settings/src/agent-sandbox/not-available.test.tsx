// @vitest-environment jsdom
import { type SandboxStartResult, sandboxStartWords } from "@halonicjs/app";
import { cantRunWords } from "@halonicjs/studio-feature-runs/api";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { AgentSandboxHostView } from "./agent-sandbox-section.tsx";
import * as text from "./sandbox-text.ts";

afterEach(unmountAll);

/** The section with no sandbox host, so it reads Not available, over a check that gives `answers` in turn. */
async function open(...answers: (SandboxStartResult | Error)[]) {
  const check = vi.fn(async (): Promise<SandboxStartResult> => {
    const answer = answers.length > 1 ? answers.shift() : answers[0];
    if (answer instanceof Error) throw answer;
    return answer as SandboxStartResult;
  });
  const announce = vi.fn();
  const root = render(
    <AgentSandboxHostView
      host={undefined}
      place="app"
      announce={announce}
      {...(answers.length > 0 ? { startCheck: { check } } : {})}
    />,
  );
  await act(async () => {});
  return { root, check, announce };
}

const refused = (reason: string): SandboxStartResult =>
  ({ ok: false, reason }) as SandboxStartResult;

const checkAgainOf = (root: HTMLElement) =>
  [...root.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text.CHECK_AGAIN),
  ) as HTMLButtonElement;

verifies("settings.agent-sandbox-not-available", () => {
  it("gives the reason, the fix, Check again and the guide, then the warning line", async () => {
    const { root } = await open(refused("bubblewrap-missing"));
    const words = sandboxStartWords("bubblewrap-missing");
    const content = root.textContent ?? "";
    expect(content).toContain("Not available");
    const order = [
      words.reason,
      words.calloutFix,
      text.CHECK_AGAIN,
      words.docsName,
      text.RUN_HERE_AFTER_WARNING,
    ].map((part) => content.indexOf(part));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(content).not.toContain(text.NOT_AVAILABLE);
    expect(root.querySelector("a")?.getAttribute("href")).toBe(
      "https://docs.halonic.dev/security/sandbox/#bubblewrap",
    );
  });

  it("leaves the fix out where it is to set the sandbox up in Settings", async () => {
    const { root } = await open(refused("setup-needed"));
    const words = sandboxStartWords("setup-needed");
    expect(root.textContent).toContain(words.reason);
    expect(root.textContent).not.toContain(words.calloutFix);
  });

  it("keeps 13.1's one line where nothing can check, and when the check passes", async () => {
    const none = await open();
    expect(none.root.textContent).toContain(text.NOT_AVAILABLE);
    const passing = await open({ ok: true });
    expect(passing.root.textContent).toContain(text.NOT_AVAILABLE);
    expect(checkAgainOf(passing.root)).toBeUndefined();
  });

  it("checks again and says what it found, changing nothing else", async () => {
    const { root, check, announce } = await open(
      refused("bubblewrap-missing"),
      refused("user-namespaces-restricted"),
      new Error("host gone"),
      { ok: true },
    );
    await act(async () => checkAgainOf(root).click());
    expect(root.textContent).toContain(sandboxStartWords("user-namespaces-restricted").reason);
    expect(announce).toHaveBeenLastCalledWith(
      `Sandbox checked: not ready. ${sandboxStartWords("user-namespaces-restricted").reason}`,
    );
    await act(async () => checkAgainOf(root).click());
    expect(root.textContent).toContain(cantRunWords.checkFailed);
    await act(async () => checkAgainOf(root).click());
    expect(announce).toHaveBeenLastCalledWith("Sandbox checked: ready.");
    expect(root.textContent).toContain(text.NOT_AVAILABLE);
    expect(check).toHaveBeenCalledTimes(4);
  });
});
