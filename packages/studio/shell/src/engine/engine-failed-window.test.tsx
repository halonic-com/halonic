// @vitest-environment jsdom

import { ClipboardProvider, OpenExternalProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell, type Shell } from "../shell.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { EngineFailedWindow, type JustUpdated } from "./engine-failed-window.tsx";
import type { EngineLauncher, EngineProcessEvents } from "./engine-start.ts";

/** A launcher whose processes the test moves by hand. */
class FakeLauncher implements EngineLauncher {
  readonly processes: EngineProcessEvents[] = [];

  start(events: EngineProcessEvents) {
    this.processes.push(events);
    return { stop: () => {} };
  }

  get latest(): EngineProcessEvents {
    const events = this.processes.at(-1);
    if (events === undefined) {
      throw new Error("No engine process was started.");
    }
    return events;
  }
}

const update: JustUpdated = {
  newVersion: "0.1.1",
  oldVersion: "0.1.0",
  releasePageUrl: "https://example.test/releases/0.1.0",
};

let restoreMediaQueries: () => void;
let timers: FakeTimers;
let shell: Shell;
let launcher: FakeLauncher;
let retry: () => void;
let writeClipboard: ReturnType<typeof vi.fn<(text: string) => Promise<boolean>>>;
let openExternal: ReturnType<typeof vi.fn<(address: string | Promise<string>) => Promise<void>>>;

beforeEach(() => {
  restoreMediaQueries = new FakeMediaQueries(1440).install();
  timers = new FakeTimers();
  shell = createShell({
    features: [defineFeature({ id: "runs", title: "Runs", register: () => {} })],
    timers,
  });
  launcher = new FakeLauncher();
  retry = shell.engine.supervise(launcher).retry;
  writeClipboard = vi.fn(async () => true);
  openExternal = vi.fn(async () => undefined);
});

afterEach(() => {
  unmountAll();
  restoreMediaQueries();
});

function renderWindow(props: { justUpdated?: JustUpdated; engineLog?: string[] } = {}) {
  return render(
    <ClipboardProvider writeClipboard={writeClipboard}>
      <OpenExternalProvider openExternal={openExternal}>
        <EngineFailedWindow shell={shell} language="en" onTryAgain={retry} {...props} />
      </OpenExternalProvider>
    </ClipboardProvider>,
  );
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((b) => b.textContent === name);
  if (found === undefined) {
    throw new Error(`No button "${name}"`);
  }
  return found;
}

async function press(target: HTMLElement): Promise<void> {
  await act(async () => target.click());
}

/** The assertive region's text once the frame has written it (it writes on the next frame). */
async function assertiveText(container: HTMLElement): Promise<string | null | undefined> {
  act(() => timers.advance(0));
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  return container.querySelector('[aria-live="assertive"]')?.textContent;
}

function failWithNoAnswer(): void {
  act(() => timers.advance(30_000));
}

verifies("shell.engine-failed-window", () => {
  it("draws nothing while the engine is starting or answering", () => {
    const container = renderWindow();
    expect(container.textContent).toBe("");
    act(() => launcher.latest.ready());
    expect(container.textContent).toBe("");
  });

  it("shows the title, the reason and the reassurance, with no sidebar or status bar items", () => {
    failWithNoAnswer();
    const container = renderWindow();
    expect(container.querySelector("h2")?.textContent).toBe("Halonic's engine didn't start");
    expect(container.textContent).toContain("It didn't answer within 30 seconds.");
    expect(container.textContent).toContain(
      "Your workspaces are folders of plain files, and nothing in them changed.",
    );
    expect(button(container, "Try again")).toBeDefined();
    expect(button(container, "Copy details")).toBeDefined();
    expect(container.querySelector("nav")).toBeNull();
    expect(container.querySelector("footer")?.children.length ?? 0).toBe(0);
  });

  it("words each reason", () => {
    act(() => launcher.latest.exited(137));
    const container = renderWindow();
    expect(container.textContent).toContain("It stopped while starting.");
    act(() => retry());
    act(() => launcher.latest.dataFolderNotWritable());
    expect(container.textContent).toContain("Halonic can't write to its data folder.");
  });

  it("moves focus to the title and announces the reason once, assertively", async () => {
    failWithNoAnswer();
    const container = renderWindow();
    expect(document.activeElement).toBe(container.querySelector("h2"));
    expect(await assertiveText(container)).toBe(
      "Halonic's engine didn't start. It didn't answer within 30 seconds.",
    );
  });

  it("shows Try again busy with its label until the engine answers, then draws nothing", async () => {
    failWithNoAnswer();
    const container = renderWindow();
    await press(button(container, "Try again"));
    expect(launcher.processes).toHaveLength(2);
    expect(button(container, "Try again").getAttribute("aria-busy")).toBe("true");
    act(() => launcher.latest.ready());
    expect(container.textContent).toBe("");
  });

  it("shows the window again, not busy, and reads the reason again when the engine fails again", async () => {
    failWithNoAnswer();
    const container = renderWindow();
    await press(button(container, "Try again"));
    act(() => launcher.latest.exited(1));
    expect(button(container, "Try again").getAttribute("aria-busy")).not.toBe("true");
    expect(container.textContent).toContain("It stopped while starting.");
    expect(await assertiveText(container)).toBe(
      "Halonic's engine didn't start. It stopped while starting.",
    );
  });

  it("puts the reason, the exit code and the log lines in Copy details, never on the window", async () => {
    act(() => launcher.latest.exited(137));
    const container = renderWindow({ engineLog: ["disk quota exceeded"] });
    expect(container.textContent).not.toContain("disk quota exceeded");
    expect(container.textContent).not.toContain("137");
    await press(button(container, "Copy details"));
    expect(writeClipboard).toHaveBeenCalledWith(
      "Halonic's engine didn't start: stopped-while-starting\nExit code: 137\ndisk quota exceeded",
    );
  });

  it("adds the update line and Open release page on the first start after an update", async () => {
    failWithNoAnswer();
    const container = renderWindow({ justUpdated: update });
    expect(container.textContent).toContain(
      "Halonic was just updated to 0.1.1. If this keeps happening, uninstall Halonic, then install 0.1.0 again from the release page. Your workspaces and settings stay.",
    );
    const link = [...container.querySelectorAll("a")].find((a) =>
      a.textContent?.startsWith("Open release page"),
    );
    expect(link?.getAttribute("href")).toBe(update.releasePageUrl);
    await press(link as HTMLElement);
    expect(openExternal).toHaveBeenCalledWith(update.releasePageUrl);
  });

  it("shows the plain window when the start isn't the first after an update", () => {
    failWithNoAnswer();
    const container = renderWindow();
    expect(container.textContent).not.toContain("just updated");
    expect(container.textContent).not.toContain("Open release page");
  });
});
