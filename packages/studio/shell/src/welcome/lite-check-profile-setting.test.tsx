// @vitest-environment jsdom

import { ClipboardProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeWelcomeStart } from "../test-support/fake-welcome-start.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { LiteCheckResult } from "./start-status.ts";
import { Welcome } from "./welcome.tsx";

let restoreShowModal: () => void;

beforeAll(() => {
  restoreShowModal = fakeShowModal();
});

afterAll(() => {
  restoreShowModal();
});

afterEach(() => {
  unmountAll();
});

/** The shell's sentence for `HALONIC_HOME="~/.halonic"` on macOS (`halonic_profile`). */
const sentence =
  'HALONIC_HOME must be a full path, not "~/.halonic". Inside quotes the shell doesn\'t turn ~ into your home folder. Use $HOME instead: HALONIC_HOME="$HOME/.halonic". Then quit Halonic and open it again.';

const relativeHome: readonly LiteCheckResult[] = [
  { id: "app_files", fact: "present" },
  { id: "profile_writable", fact: "halonic_home_relative", message: sentence },
  { id: "disk_space", fact: "unknown" },
];

/** Check this computer, opened after a failed start, with a relative `HALONIC_HOME`. */
async function openCheck(writeClipboard: (text: string) => Promise<boolean>) {
  const start = new FakeWelcomeStart();
  start.results = relativeHome;
  const root = render(
    <ClipboardProvider writeClipboard={writeClipboard}>
      <Welcome
        onOpenFolder={async () => undefined}
        onTrySample={async () => undefined}
        start={start}
      />
    </ClipboardProvider>,
  );
  start.answer({ state: "failed", seconds: 60, cause: "timed_out" });
  const opener = [...root.querySelectorAll("button")].find((each) =>
    each.textContent?.includes("Check this computer"),
  );
  await act(async () => opener?.click());
  const dialog = document.querySelector("dialog");
  if (dialog === null) throw new Error("No dialog");
  return dialog;
}

verifies("shell.welcome-lite-check-profile-setting", () => {
  it("shows the shell's sentence and fix on the Profile folder line, as the one problem", async () => {
    const dialog = await openCheck(async () => true);

    const items = [...dialog.querySelectorAll("li")].map((each) => each.textContent);
    expect(items).toContain(`Profile folder, problem: ${sentence}`);
    expect(items[0]).toBe("Engine, info: Not running, because of the problem below");
    const heading = [...dialog.querySelectorAll('[role="status"]')].map((each) => each.textContent);
    expect(heading).toContain("1 problem · 1 warning");
  });

  it("keeps the value and the sentence out of the report", async () => {
    const writeClipboard = vi.fn(async (_text: string) => true);
    const dialog = await openCheck(writeClipboard);
    const shown = dialog.querySelector("pre")?.textContent ?? "";

    const copy = [...dialog.querySelectorAll("button")].find((each) =>
      each.textContent?.includes("Copy report"),
    );
    await act(async () => copy?.click());
    expect(writeClipboard).toHaveBeenCalledWith(shown);
    expect(shown).toContain("✕ Profile folder  HALONIC_HOME isn't a full path");
    expect(shown).not.toContain("~/.halonic");
    expect(shown).not.toContain("must be a full path");
  });
});
