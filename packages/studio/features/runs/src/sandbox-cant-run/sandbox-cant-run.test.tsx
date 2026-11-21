// @vitest-environment jsdom
import { type SandboxStartCheck, type SandboxStartResult, sandboxStartWords } from "@halonicjs/app";
import { Button, PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, useId, useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { SandboxCantRunCallout } from "./sandbox-cant-run-callout.tsx";
import { useSandboxStart } from "./use-sandbox-start.ts";

afterEach(unmountAll);

/** A page with one Run that needs the sandbox, as the workflow and routine pages use the Callout. */
function Page({
  check,
  needed = true,
  announce,
  run,
}: {
  readonly check: SandboxStartCheck | undefined;
  readonly needed?: boolean;
  readonly announce?: (line: string) => void;
  readonly run?: () => void;
}) {
  const start = useSandboxStart(check, needed);
  const firstLineId = useId();
  const runButton = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={runButton}
        variant="primary"
        unavailable={start.refused === undefined ? undefined : { reason: firstLineId }}
        onClick={run}
      >
        Run
      </Button>
      <SandboxCantRunCallout
        name="Support reply"
        start={start}
        firstLineId={firstLineId}
        announce={announce}
        onReady={() => runButton.current?.focus()}
        band
      >
        The step Draft uses Claude Code.
      </SandboxCantRunCallout>
    </>
  );
}

/** A check that answers each call with the next of `answers`; the last one repeats. */
function checkSaying(...answers: (SandboxStartResult | Error)[]) {
  const check = vi.fn(async (): Promise<SandboxStartResult> => {
    const answer = answers.length > 1 ? answers.shift() : answers[0];
    if (answer instanceof Error) throw answer;
    return answer as SandboxStartResult;
  });
  return { check };
}

const refused = (reason: string) => ({ ok: false, reason }) as SandboxStartResult;

async function open(node: React.ReactNode, phone = false) {
  const root = render(
    <PresentationProvider presentation={phone ? "phone" : "desktop"}>{node}</PresentationProvider>,
  );
  await act(async () => {});
  return root;
}

const runOf = (root: HTMLElement) =>
  [...root.querySelectorAll("button")].find((one) => one.textContent === "Run") as HTMLElement;
const checkAgainOf = (root: HTMLElement) =>
  [...root.querySelectorAll("button")].find((one) =>
    one.textContent?.includes("Check again"),
  ) as HTMLElement;

verifies("runs.sandbox-cant-run", () => {
  it("disables Run, still focusable, and names the Callout's first line as why", async () => {
    const root = await open(<Page check={checkSaying(refused("bubblewrap-missing"))} />);
    const run = runOf(root);
    expect(run.getAttribute("aria-disabled")).toBe("true");
    expect(run.hasAttribute("disabled")).toBe(false);
    const why = document.getElementById(run.getAttribute("aria-describedby") ?? "");
    expect(why?.textContent).toBe(
      "Support reply can't run: the sandbox can't start on this computer.",
    );
  });

  it("leads with the fix, then Check again and the guide, then the page's line (J: fix first)", async () => {
    const root = await open(<Page check={checkSaying(refused("bubblewrap-missing"))} />);
    const words = sandboxStartWords("bubblewrap-missing");
    const text = root.textContent ?? "";
    const order = [
      "Support reply can't run",
      words.cantRunFix,
      "Check again",
      "How to install bubblewrap",
      "The step Draft uses Claude Code.",
    ].map((part) => text.indexOf(part));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).not.toContain(words.reason);
    expect(text).not.toContain("Install it");
    expect(root.querySelector("code")?.textContent).toBe("sudo apt install bubblewrap");
    expect(root.querySelector("a")?.getAttribute("href")).toBe(
      "https://docs.halonic.dev/security/sandbox/#bubblewrap",
    );
  });

  it("offers no way to run without the sandbox, and a disabled Run starts nothing (J)", async () => {
    const run = vi.fn();
    const root = await open(<Page check={checkSaying(refused("other"))} run={run} />);
    const controls = [...root.querySelectorAll("button, a, [role='menuitem']")].map(
      (control) => control.textContent,
    );
    expect(controls).toEqual([
      "Run",
      expect.stringContaining("Check again"),
      expect.stringContaining("What the sandbox needs"),
    ]);
    expect(root.textContent).not.toMatch(/run anyway|skip|continue without/i);
    act(() => runOf(root).click());
    expect(run).not.toHaveBeenCalled();
  });

  it("says what is wrong only for other, and for a code Halonic doesn't know", async () => {
    const root = await open(<Page check={checkSaying(refused("from-the-future"))} />);
    const text = root.textContent ?? "";
    const reasonAt = text.indexOf("Halonic can't tell what the sandbox is missing.");
    expect(reasonAt).toBeGreaterThan(text.indexOf("Support reply can't run"));
    expect(reasonAt).toBeLessThan(text.indexOf(sandboxStartWords("other").cantRunFix));
  });

  it("gives its own fix on a phone, which names the thing", async () => {
    const root = await open(<Page check={checkSaying(refused("bubblewrap-missing"))} />, true);
    const words = sandboxStartWords("bubblewrap-missing");
    expect(root.textContent).toContain(words.cantRunPhoneFix);
    expect(root.textContent).not.toContain(words.phoneFix);
  });

  it("removes the Callout, says so and gives Run focus once Check again finds it ready", async () => {
    const announce = vi.fn();
    const root = await open(
      <Page check={checkSaying(refused("bubblewrap-missing"), { ok: true })} announce={announce} />,
    );
    await act(async () => checkAgainOf(root).click());
    expect(root.textContent).not.toContain("can't run");
    expect(runOf(root).hasAttribute("aria-disabled")).toBe(false);
    expect(document.activeElement).toBe(runOf(root));
    expect(announce).toHaveBeenCalledWith("The sandbox works now. You can run Support reply.");
  });

  it("changes the lines to a new reason and keeps focus on Check again", async () => {
    const announce = vi.fn();
    const root = await open(
      <Page
        check={checkSaying(refused("bubblewrap-missing"), refused("user-namespaces-restricted"))}
        announce={announce}
      />,
    );
    checkAgainOf(root).focus();
    await act(async () => checkAgainOf(root).click());
    expect(root.textContent).toContain(sandboxStartWords("user-namespaces-restricted").cantRunFix);
    expect(document.activeElement).toBe(checkAgainOf(root));
    expect(announce).toHaveBeenCalledWith(
      `Sandbox checked: not ready. ${sandboxStartWords("user-namespaces-restricted").reason}`,
    );
  });

  it("is busy while it checks, and ignores presses until the answer", async () => {
    let answer: (result: SandboxStartResult) => void = () => {};
    const first = refused("bubblewrap-missing");
    const check = vi
      .fn<() => Promise<SandboxStartResult>>()
      .mockResolvedValueOnce(first)
      .mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const root = await open(<Page check={{ check }} />);
    act(() => checkAgainOf(root).click());
    const button = checkAgainOf(root);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.textContent).toContain("Checking…");
    act(() => button.click());
    expect(check).toHaveBeenCalledTimes(2);
    await act(async () => answer(first));
    expect(checkAgainOf(root).hasAttribute("aria-busy")).toBe(false);
  });

  it("adds a line when it can't check, and keeps the Callout", async () => {
    const root = await open(
      <Page check={checkSaying(refused("bubblewrap-missing"), new Error("host gone"))} />,
    );
    await act(async () => checkAgainOf(root).click());
    expect(root.textContent).toContain("Halonic couldn't check the sandbox. Try again.");
    expect(runOf(root).getAttribute("aria-disabled")).toBe("true");
  });

  it("disables nothing when the first check can't run, or nothing can check", async () => {
    const failing = await open(<Page check={checkSaying(new Error("host gone"))} />);
    expect(runOf(failing).hasAttribute("aria-disabled")).toBe(false);
    expect(failing.textContent).not.toContain("can't run");
    const none = await open(<Page check={undefined} />);
    expect(runOf(none).hasAttribute("aria-disabled")).toBe(false);
  });

  it("doesn't check where no control would start a program", async () => {
    const check = checkSaying(refused("bubblewrap-missing"));
    const root = await open(<Page check={check} needed={false} />);
    expect(check.check).not.toHaveBeenCalled();
    expect(root.textContent).not.toContain("can't run");
  });
});
