// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { UpdaterHost } from "../api.ts";
import { click } from "../test-support/controls.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AboutHostView } from "./about-section.tsx";
import type { UpdateState, UpdateStatus } from "./updater-status.ts";

afterEach(unmountAll);

const notesUrl = "https://example.test/notes";

function statusOf(state: UpdateState, rest: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    current: "0.1.0",
    automatic: true,
    checking: false,
    lastChecked: Date.now(),
    justUpdated: null,
    managed: null,
    state,
    ...rest,
  };
}

/** An updater whose status the test sets, that records which actions were asked. */
function fakeHost(first: UpdateStatus) {
  let now = first;
  const listeners = new Set<(status: UpdateStatus) => void>();
  const host = {
    status: vi.fn(async () => now),
    subscribe: vi.fn((listener: (status: UpdateStatus) => void) => {
      listeners.add(listener);
      listener(now);
      return () => listeners.delete(listener);
    }),
    check: vi.fn(async () => now),
    download: vi.fn(async () => now),
    cancel: vi.fn(async () => now),
    restart: vi.fn(async () => undefined),
    setAutomatic: vi.fn(async (on: boolean) => {
      now = { ...now, automatic: on };
      return now;
    }),
  } satisfies UpdaterHost;
  return {
    host,
    set(next: UpdateStatus) {
      now = next;
      act(() => {
        for (const listener of listeners) listener(next);
      });
    },
  };
}

async function show(host: UpdaterHost, announce = vi.fn()) {
  const view = render(<AboutHostView host={host} announce={announce} />);
  await act(async () => {});
  return { view, announce };
}

function button(view: HTMLElement, label: string): HTMLButtonElement {
  const found = [...view.querySelectorAll("button")].find((each) =>
    each.textContent?.startsWith(label),
  );
  if (found === undefined) throw new Error(`No button "${label}" in: ${view.textContent}`);
  return found;
}

verifies("settings.about-section", () => {
  it("shows the version and the status line, and checks or downloads nothing by itself", async () => {
    const { host } = fakeHost(statusOf({ kind: "available", version: "0.1.1", notesUrl }));
    const { view } = await show(host);
    expect(view.textContent).toContain("Halonic 0.1.0");
    expect(view.textContent).toContain("Halonic 0.1.1 is available. You have 0.1.0.");
    expect(host.check).not.toHaveBeenCalled();
    expect(host.download).not.toHaveBeenCalled();
    expect(host.setAutomatic).not.toHaveBeenCalled();
  });

  it("downloads only when Download is pressed", async () => {
    const { host } = fakeHost(statusOf({ kind: "available", version: "0.1.1", notesUrl }));
    const { view } = await show(host);
    await click(button(view, "Download Halonic 0.1.1"));
    expect(host.download).toHaveBeenCalledOnce();
  });

  it("announces the result of Check now with the version", async () => {
    const { host } = fakeHost(statusOf({ kind: "up-to-date" }));
    const { view, announce } = await show(host);
    await click(button(view, "Check now"));
    expect(host.check).toHaveBeenCalledOnce();
    expect(announce).toHaveBeenCalledWith(
      expect.stringMatching(/^Halonic 0\.1\.0 is up to date\. Checked today at /),
    );
  });

  it("draws the bar from the first byte and follows the shell's changes", async () => {
    const fake = fakeHost(
      statusOf({
        kind: "downloading",
        version: "0.1.1",
        done: 12_000_000,
        total: 48_000_000,
        unit: "bytes",
      }),
    );
    const { view } = await show(fake.host);
    const bar = view.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute("aria-label")).toBe("Downloading Halonic 0.1.1");
    expect(bar?.getAttribute("aria-valuenow")).toBe("25");
    expect(bar?.getAttribute("aria-valuetext")).toBe("12 of 48 MB");
    fake.set(statusOf({ kind: "ready", version: "0.1.1", notesUrl }));
    expect(view.querySelector('[role="progressbar"]')).toBeNull();
    expect(view.textContent).toContain("Halonic 0.1.1 is ready.");
  });

  it("gives an unknown total a bar without a value", async () => {
    const { host } = fakeHost(
      statusOf({
        kind: "downloading",
        version: "0.1.1",
        done: 400_000,
        total: null,
        unit: "bytes",
      }),
    );
    const { view } = await show(host);
    const bar = view.querySelector('[role="progressbar"]');
    expect(bar?.hasAttribute("aria-valuenow")).toBe(false);
    expect(bar?.getAttribute("aria-valuetext")).toBe("0.4 MB");
  });

  it("shows a signature that doesn't match in a Callout with Report a problem", async () => {
    const { host } = fakeHost(
      statusOf({ kind: "signature-mismatch", version: "0.1.1", attempts: 1 }),
    );
    const { view } = await show(host);
    expect(view.textContent).toContain("its signature doesn't match Halonic's");
    expect(view.querySelectorAll("a")).not.toHaveLength(0);
  });

  it("saves the automatic switch at once, on a press only", async () => {
    const { host } = fakeHost(statusOf({ kind: "up-to-date" }));
    const { view } = await show(host);
    const toggle = view.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(toggle?.checked).toBe(true);
    await click(toggle as HTMLInputElement);
    expect(host.setAutomatic).toHaveBeenCalledWith(false);
  });

  it("hides the switch and the buttons when another tool manages updates", async () => {
    const { host } = fakeHost(
      statusOf(
        { kind: "available", version: "0.1.1", notesUrl },
        { managed: { by: "scoop", command: "scoop update halonic" } },
      ),
    );
    const { view } = await show(host);
    expect(view.querySelector('input[type="checkbox"]')).toBeNull();
    expect(view.querySelectorAll("button")).toHaveLength(1);
    expect(button(view, "Check now")).toBeDefined();
  });

  it("says so, in words, when a press gets no answer", async () => {
    const { host } = fakeHost(statusOf({ kind: "up-to-date" }));
    host.check.mockRejectedValueOnce(new Error("ipc closed"));
    const { view } = await show(host);
    await click(button(view, "Check now"));
    expect(view.textContent).toContain("Halonic's updater didn't answer. Try again.");
    expect(view.textContent).not.toContain("ipc closed");
  });
});
