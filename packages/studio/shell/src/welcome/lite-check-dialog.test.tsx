// @vitest-environment jsdom

import { ClipboardProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeWelcomeStart } from "../test-support/fake-welcome-start.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { checkHeading, checkLines, checkReport } from "./lite-check-lines.ts";
import type { StartView } from "./start-status.ts";
import { Welcome } from "./welcome.tsx";

let restoreShowModal: () => void;
let start: FakeWelcomeStart;
let writeClipboard: ReturnType<typeof vi.fn<(text: string) => Promise<boolean>>>;

beforeAll(() => {
  restoreShowModal = fakeShowModal();
});

afterAll(() => {
  restoreShowModal();
});

beforeEach(() => {
  start = new FakeWelcomeStart();
  writeClipboard = vi.fn(async () => true);
});

afterEach(() => {
  unmountAll();
});

const timedOut: StartView = { kind: "failed", cause: "timed_out", exitCode: null, seconds: 60 };

function button(root: ParentNode, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((each) =>
    each.textContent?.includes(label),
  );
  if (found === undefined) throw new Error(`No ${label} button`);
  return found;
}

/** Welcome after a failed start, with Check this computer open and its check answered. */
async function openCheck(): Promise<HTMLDialogElement> {
  const root = render(
    <ClipboardProvider writeClipboard={writeClipboard}>
      <Welcome onOpenFolder={async () => undefined} start={start} />
    </ClipboardProvider>,
  );
  start.answer({ state: "failed", seconds: 60, cause: "timed_out" });
  await act(async () => button(root, "Check this computer").click());
  const dialog = document.querySelector("dialog");
  if (dialog === null) throw new Error("No dialog");
  return dialog;
}

verifies("shell.welcome-lite-check", () => {
  it("runs the check at once and lists the lines, the engine's checks as Not checked", async () => {
    const dialog = await openCheck();

    expect(start.checks).toBe(1);
    expect(dialog.textContent).toContain("Halonic 0.1.0 · macOS");
    const items = [...dialog.querySelectorAll("li")].map((each) => each.textContent);
    expect(items).toEqual([
      "Engine, problem: Not running",
      "Halonic's files, works: All there",
      "Profile folder, works: Halonic can write to it",
      "Disk, works: Enough free space",
      "Not checked, info: The engine's checks, because the engine isn't running",
    ]);
    const heading = [...dialog.querySelectorAll('[role="status"]')].map((each) => each.textContent);
    expect(heading).toContain("1 problem");
  });

  it("reads Not checked for the window's checks when the check can't run", async () => {
    start.check = async () => {
      throw new Error("not granted");
    };
    const dialog = await openCheck();

    expect(dialog.textContent).toContain(
      "Halonic's files, profile folder and disk, because the check couldn't run",
    );
    expect(dialog.textContent).not.toContain("All there");
  });

  it("runs again on Check again", async () => {
    const dialog = await openCheck();

    await act(async () => button(dialog, "Check again").click());
    expect(start.checks).toBe(2);
  });

  it("copies the report that Show the report unfolds, with the cause id but no more", async () => {
    const dialog = await openCheck();
    const shown = dialog.querySelector("pre")?.textContent;

    await act(async () => button(dialog, "Copy report").click());
    expect(writeClipboard).toHaveBeenCalledWith(shown);
    expect(shown).toContain("✕ Engine          Not running · cause timed_out · after 60 s");
    expect(shown).toContain("– Not checked     The engine's checks");
  });

  it("counts one cause once: a missing file explains the engine", () => {
    const lines = checkLines(timedOut, [
      { id: "app_files", fact: "missing" },
      { id: "profile_writable", fact: "writable" },
      { id: "disk_space", fact: "enough" },
    ]);

    expect(lines[0]).toMatchObject({
      mark: "info",
      text: "Not running, because of the problem below",
    });
    expect(lines[1]).toMatchObject({ label: "Halonic's files", mark: "problem" });
    expect(checkHeading(lines)).toBe("1 problem");
  });

  it("never counts a sandbox that isn't set up", () => {
    const lines = checkLines({ kind: "ready" }, [
      { id: "app_files", fact: "present" },
      { id: "profile_writable", fact: "writable" },
      { id: "disk_space", fact: "enough" },
      { id: "wsl_distro", fact: "missing" },
      { id: "wsl_runtime", fact: "not_checked" },
    ]);

    expect(lines.find((line) => line.label === "Sandbox")).toEqual({
      label: "Sandbox",
      mark: "info",
      text: "Not set up yet. The demo doesn't need the sandbox.",
    });
    expect(checkHeading(lines)).toBe("No problems");
  });

  it.each([
    [{ wsl_distro: "present", wsl_runtime: "present" }, "pass", "Set up"],
    [{ wsl_distro: "present", wsl_runtime: "missing" }, "info", "Not set up yet."],
    [{ wsl_distro: "wsl_missing", wsl_runtime: "not_checked" }, "info", "Not set up yet."],
    [{ wsl_distro: "unknown", wsl_runtime: "not_checked" }, "info", "Couldn't check"],
  ] as const)("words the sandbox %o", (facts, mark, text) => {
    const lines = checkLines({ kind: "ready" }, [
      { id: "wsl_distro", fact: facts.wsl_distro },
      { id: "wsl_runtime", fact: facts.wsl_runtime },
    ]);
    const sandbox = lines.find((line) => line.label === "Sandbox");

    expect(sandbox?.mark).toBe(mark);
    expect(sandbox?.text).toContain(text);
  });

  it("words the profile and the disk", () => {
    const lines = checkLines(timedOut, [
      { id: "profile_writable", fact: "no_profile" },
      { id: "disk_space", fact: "low", freeBytes: 600_000_000 },
    ]);

    expect(lines[1]).toMatchObject({
      mark: "info",
      text: "Couldn't check: Halonic couldn't find it",
    });
    expect(lines[2]).toMatchObject({ mark: "warning", text: "Low on disk space: 0.6 GB free" });
    expect(checkHeading(lines)).toBe("1 problem · 1 warning");
  });

  it("builds the report from named fields only", () => {
    const at = new Date(2026, 10, 21, 10, 42);
    const report = checkReport("Halonic 0.1.0 · Windows", at, checkLines(timedOut, undefined));

    expect(report).toBe(
      [
        "Check this computer",
        "Halonic 0.1.0 · Windows",
        "2026-11-21 10:42",
        "1 problem",
        "",
        "✕ Engine          Not running · cause timed_out · after 60 s",
        "– Not checked     Halonic's files, profile folder and disk, because Check this computer wasn't run",
        "– Not checked     The engine's checks, because the engine isn't running",
      ].join("\n"),
    );
  });
});
