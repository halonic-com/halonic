// @vitest-environment jsdom

import { RecentWorkspaces } from "@halonicjs/studio-feature-workspace";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type StartedStudio, startStudio } from "./start-studio.ts";

/** The desktop app's webview in the window the shell labelled `label`, recording each command. */
function webviewLabelled(label: string, called: string[]) {
  return {
    __TAURI_INTERNALS__: {
      invoke: async (command: string) => {
        called.push(command);
        return command === "plugin:feedback|still" ? new ArrayBuffer(0) : null;
      },
      transformCallback: () => 1,
      unregisterCallback: () => {},
      metadata: { currentWindow: { label } },
    },
  };
}

let element: HTMLDivElement;
let started: StartedStudio | undefined;

beforeEach(() => {
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(async () => {
  await started?.stop();
  started = undefined;
  element.remove();
});

function start(label: string, called: string[]) {
  // Acme is in Recent, so a window that opened the last workspace would ask the shell for it.
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
  new RecentWorkspaces(storage).remember({ location: "/work/acme", name: "acme" });
  started = startStudio({
    element,
    window: webviewLabelled(label, called),
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    storage,
  });
}

verifies("studio.feedback-windows", () => {
  it("shows only the overlay in a window labelled feedback-overlay-0, and opens no workspace", async () => {
    const called: string[] = [];
    // This still is empty, so the overlay ends the feedback and says why in the console.
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    start("feedback-overlay-0", called);
    await vi.waitFor(() => expect(called).toContain("plugin:feedback|end"));
    expect(element.querySelector("[data-feedback-overlay]")).not.toBeNull();
    expect(called).toContain("plugin:feedback|still");
    errors.mockRestore();
    expect(called.filter((command) => !command.startsWith("plugin:feedback|"))).toEqual([]);
  });

  it("shows only the not-available window in the window labelled feedback-unavailable", async () => {
    const called: string[] = [];
    start("feedback-unavailable", called);
    await vi.waitFor(() =>
      expect(element.textContent).toBe(
        "Studio can't take a screenshot for feedback on this system.Not now",
      ),
    );
    expect(called).toEqual([]);
  });
});
