// @vitest-environment jsdom

import { ClipboardProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FakeWelcomeStart } from "../test-support/fake-welcome-start.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { startView } from "./start-status.ts";
import { Welcome } from "./welcome.tsx";

let start: FakeWelcomeStart;
let writeClipboard: ReturnType<typeof vi.fn<(text: string) => Promise<boolean>>>;

beforeEach(() => {
  start = new FakeWelcomeStart();
  writeClipboard = vi.fn(async () => true);
});

afterEach(() => {
  unmountAll();
});

const offLine = "Open demo and Open folder work once the engine is running.";

function renderWelcome(onOpenFolder = vi.fn(async () => undefined)) {
  return render(
    <ClipboardProvider writeClipboard={writeClipboard}>
      <Welcome onOpenFolder={onOpenFolder} onTrySample={async () => undefined} start={start} />
    </ClipboardProvider>,
  );
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((each) =>
    each.textContent?.includes(label),
  );
  if (found === undefined) throw new Error(`No ${label} button`);
  return found;
}

function statusTexts(root: HTMLElement): string[] {
  return [...root.querySelectorAll('[role="status"]')].map((each) => each.textContent ?? "");
}

verifies("shell.welcome-start", () => {
  it("shows nothing and keeps the buttons on during the first 2 seconds", () => {
    const root = renderWelcome();
    start.answer({ state: "starting", seconds: 1 });

    expect(root.textContent).not.toContain("Starting Halonic…");
    expect(root.textContent).not.toContain(offLine);
    expect(button(root, "Open folder").getAttribute("aria-disabled")).toBeNull();
  });

  it("shows the waiting line from 2 seconds and turns the buttons off, saying why", () => {
    const root = renderWelcome();
    start.answer({ state: "starting", seconds: 3 });

    expect(root.textContent).toContain("Starting Halonic…");
    expect(root.textContent).toContain("3 s");
    const off = [...root.querySelectorAll("p")].find((each) => each.textContent === offLine);
    for (const label of ["Open demo", "Open folder"]) {
      const each = button(root, label);
      expect(each.getAttribute("aria-disabled")).toBe("true");
      expect(each.getAttribute("aria-describedby")).toContain(off?.id);
    }
  });

  it("keeps room for the 10 s sentence from the moment the line shows", () => {
    const root = renderWelcome();
    start.answer({ state: "starting", seconds: 3 });
    const box = root.querySelector(".min-h-21");
    expect(box?.textContent).toContain("Starting Halonic…");

    start.answer({ state: "starting", seconds: 12 });
    expect(root.querySelector(".min-h-21")).toBe(box);
    expect(box?.textContent).toContain("The first start takes longer than the next ones.");
    expect(button(root, "Something wrong?")).toBeDefined();
  });

  it("says Still starting from the shell's still_starting", () => {
    const root = renderWelcome();
    start.answer({ state: "still_starting", seconds: 34 });

    expect(root.textContent).toContain(
      "Still starting. The first start unpacks Halonic's files, which can take up to a minute.",
    );
    expect(root.textContent).not.toContain("The first start takes longer");
  });

  it("shows why it failed, focuses the failure and keeps the cause id and exit code off screen", async () => {
    const root = renderWelcome();
    start.answer({ state: "failed", seconds: 4, cause: "stopped", exitCode: 137 });

    const failure = root.querySelector('[role="group"]');
    expect(failure?.textContent).toContain("Halonic's engine didn't start");
    expect(failure?.textContent).toContain("Halonic's engine stopped while it was starting.");
    expect(document.activeElement).toBe(failure);
    expect(root.textContent).not.toContain("137");
    expect(root.textContent).not.toContain("stopped ·");
    expect(root.textContent).toContain(offLine);

    await act(async () => button(root, "Copy report").click());
    const report = writeClipboard.mock.calls[0]?.[0] ?? "";
    expect(report).toContain("Not running · cause stopped · exit code 137 · after 4 s");
    expect(report).toContain("Halonic 0.1.0 · macOS");
    expect(report).toContain(
      "Not checked     Halonic's files, profile folder and disk, because Check this computer wasn't run",
    );
  });

  it.each([
    ["timed_out", "Halonic waited a minute and got no answer from its engine."],
    ["missing", "Some of Halonic's files are missing or damaged."],
    ["broken", "Some of Halonic's files are missing or damaged."],
    ["blocked", "Something on this computer blocked Halonic from starting"],
    ["wsl_failed", "WSL didn't answer when Halonic started its engine."],
    ["other", "Halonic's engine couldn't start."],
    ["from_a_newer_shell", "Halonic's engine couldn't start."],
  ] as const)("words the cause %s", (cause, sentence) => {
    const root = renderWelcome();
    // A cause a newer window sends arrives as a plain string.
    start.answer({ state: "failed", seconds: 60, cause: cause as "other" });

    expect(root.textContent).toContain(sentence);
  });

  it.each(["wsl_missing", "distro_missing", "runtime_missing"] as const)(
    "counts %s as ready: the sandbox isn't set up yet",
    (cause) => {
      expect(
        startView({ state: "failed", phase: "engine_ready", cause, exitCode: null, seconds: 1 }),
      ).toEqual({ kind: "ready" });
      const root = renderWelcome();
      start.answer({ state: "failed", seconds: 1, cause });

      expect(root.textContent).not.toContain("didn't start");
      expect(button(root, "Open folder").getAttribute("aria-disabled")).toBeNull();
    },
  );

  it("holds a press before the start is ready and runs it once it is", async () => {
    const onOpenFolder = vi.fn(async () => undefined);
    const root = renderWelcome(onOpenFolder);
    start.answer({ state: "starting", seconds: 1 });

    await act(async () => button(root, "Open folder").click());
    expect(onOpenFolder).not.toHaveBeenCalled();
    expect(button(root, "Opening…").getAttribute("aria-busy")).toBe("true");

    await act(async () => start.answer({ state: "ready", seconds: 1 }));
    expect(onOpenFolder).toHaveBeenCalledTimes(1);
  });

  it("drops a held press when the start fails", async () => {
    const onOpenFolder = vi.fn(async () => undefined);
    const root = renderWelcome(onOpenFolder);
    start.answer({ state: "starting", seconds: 1 });
    await act(async () => button(root, "Open folder").click());

    await act(async () => start.answer({ state: "failed", seconds: 60, cause: "timed_out" }));
    expect(onOpenFolder).not.toHaveBeenCalled();
    expect(button(root, "Open folder").getAttribute("aria-busy")).not.toBe("true");
  });

  it("says Halonic is ready once, only after the line showed", () => {
    const root = renderWelcome();
    start.answer({ state: "starting", seconds: 1 });
    start.answer({ state: "ready", seconds: 1 });
    expect(statusTexts(root)).not.toContain("Halonic is ready");

    start.answer({ state: "starting", seconds: 5 });
    start.answer({ state: "ready", seconds: 6 });
    expect(root.textContent).not.toContain("Starting Halonic…");
    expect(statusTexts(root)).toContain("Halonic is ready");
  });

  it("tries again, and gives focus back to the leading button when the failure goes", async () => {
    const root = renderWelcome();
    start.answer({ state: "failed", seconds: 60, cause: "timed_out" });

    await act(async () => button(root, "Try again").click());
    expect(start.tries).toBe(1);

    start.answer({ state: "starting", seconds: 0 });
    expect(root.textContent).not.toContain("didn't start");
    expect(document.activeElement?.textContent).toContain("Open demo");
  });
});

it("shows no start without one", () => {
  const root = render(<Welcome onOpenFolder={async () => undefined} />);

  expect(statusTexts(root)).toEqual([]);
  expect(root.textContent).not.toContain("Starting Halonic…");
});

it("keeps the focus on a failure that is there when Welcome draws", () => {
  const start = new FakeWelcomeStart();
  start.report = {
    state: "failed",
    phase: "engine_ready",
    cause: "blocked",
    exitCode: null,
    seconds: 1,
  };
  const root = render(<Welcome onOpenFolder={async () => undefined} start={start} />);

  expect(document.activeElement).toBe(root.querySelector('[role="group"]'));
});
