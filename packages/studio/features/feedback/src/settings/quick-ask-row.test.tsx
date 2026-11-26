// @vitest-environment jsdom
import type {
  AskKeys,
  AskKeysChange,
  AskKeysSettings,
} from "@halonicjs/studio-feature-quick-ask/api";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { FeedbackSettingsHost } from "../api.ts";
import { KeyboardView } from "./keyboard-section.tsx";
import { button, press, render, settle, unmountAll } from "./test-support.tsx";

afterEach(unmountAll);

const feedbackHost: FeedbackSettingsHost = {
  platform: "windows",
  setShortcut: async () => "saved",
};

const wayland =
  "Your desktop doesn't let apps add a shortcut. Add one in your desktop's settings that runs: halonic-studio --app ask";

/** Quick ask's keys as the shell reads them, and a shell that answers every change `answer`. */
function askKeys(read: AskKeys, answer: AskKeysChange = "saved") {
  return {
    platform: "windows",
    keys: vi.fn(async () => read),
    setKeys: vi.fn(async (_shortcut: string): Promise<AskKeysChange> => answer),
  } satisfies AskKeysSettings;
}

/** Settings → Keyboard with `settings` for quick ask, once the shell has said the keys. */
async function showKeyboard(settings: AskKeysSettings | undefined, announced: string[] = []) {
  const container = render(
    <KeyboardView
      host={feedbackHost}
      saved="control+alt+KeyF"
      announce={(line) => announced.push(line)}
      askKeys={settings}
    />,
  );
  await settle();
  return container;
}

/** The Quick ask row: the second row on the page. */
function quickAskRow(container: HTMLElement): HTMLElement {
  const row = container.firstElementChild?.children[1];
  if (!(row instanceof HTMLElement)) throw new Error("No Quick ask row.");
  return row;
}

/** The keys a row shows, as one line: "Ctrl Alt Space". */
function shownKeys(row: HTMLElement): string {
  return [...row.querySelectorAll("kbd")].map((key) => key.textContent).join(" ");
}

verifies("feedback.settings-quick-ask", () => {
  it("shows the Quick ask row under Send feedback with the keys the shell reads", async () => {
    const container = await showKeyboard(askKeys({ shortcut: "control+alt+Space", state: "on" }));

    const row = quickAskRow(container);
    expect(row.textContent).toContain("Quick ask");
    expect(shownKeys(row)).toBe("Ctrl Alt Space");
    expect(row.querySelector("p")).toBeNull();
  });

  it("shows ⌥ Space on macOS", async () => {
    const settings = {
      ...askKeys({ shortcut: "alt+Space", state: "on" }),
      platform: "macos",
    } as const;
    const container = await showKeyboard(settings);

    expect(shownKeys(quickAskRow(container))).toBe("⌥ Space");
  });

  it("says the keys are taken when another app holds them", async () => {
    const container = await showKeyboard(
      askKeys({ shortcut: "control+alt+Space", state: "taken" }),
    );

    const row = quickAskRow(container);
    expect(shownKeys(row)).toBe("Ctrl Alt Space");
    expect(row.querySelector(".text-attention")?.textContent).toBe(
      "Ctrl+Alt+Space is taken by another app. Pick another key.",
    );
  });

  it("says how to add a desktop shortcut on Wayland, with no keys and no Change", async () => {
    const container = await showKeyboard(
      askKeys({ shortcut: "control+alt+Space", state: "wayland" }),
    );

    const row = quickAskRow(container);
    expect(row.textContent).toContain("Quick ask");
    expect(row.querySelector("p")?.textContent).toBe(wayland);
    expect(row.querySelector("kbd")).toBeNull();
    expect(row.querySelector("button")).toBeNull();
  });

  it("records Ctrl+Alt+K, asks the shell for it and shows the new keys", async () => {
    const settings = askKeys({ shortcut: "control+alt+Space", state: "taken" });
    const container = await showKeyboard(settings);
    const row = quickAskRow(container);

    act(() => button(row, "Change").click());
    press({ code: "KeyK", key: "k", ctrlKey: true, altKey: true });
    await settle();

    expect(settings.setKeys).toHaveBeenCalledWith("Control+Alt+KeyK");
    expect(shownKeys(row)).toBe("Ctrl Alt K");
    expect(row.querySelector("p")).toBeNull();
  });

  it("keeps the old keys when the shell refuses new ones as taken, and says so", async () => {
    const announced: string[] = [];
    const settings = askKeys({ shortcut: "control+alt+Space", state: "on" }, "taken");
    const container = await showKeyboard(settings, announced);
    const row = quickAskRow(container);

    act(() => button(row, "Change").click());
    press({ code: "KeyK", key: "k", ctrlKey: true, altKey: true });
    await settle();

    const taken = "Ctrl+Alt+K is taken by another app. Pick another key.";
    expect(shownKeys(row)).toBe("Ctrl Alt Space");
    expect(row.querySelector(".text-attention")?.textContent).toBe(taken);
    expect(announced).toEqual([taken]);
  });

  it("says it couldn't save when the shell couldn't, and keeps the old keys", async () => {
    const settings = askKeys({ shortcut: "control+alt+Space", state: "on" }, "failed");
    const container = await showKeyboard(settings);
    const row = quickAskRow(container);

    act(() => button(row, "Change").click());
    press({ code: "KeyK", key: "k", ctrlKey: true, altKey: true });
    await settle();

    expect(shownKeys(row)).toBe("Ctrl Alt Space");
    expect(row.querySelector(".text-danger")?.textContent).toBe(
      `Couldn't save "Quick ask" on this computer.`,
    );
  });

  it("shows no Quick ask row where the app gives no quick ask keys", async () => {
    const container = await showKeyboard(undefined);

    expect(container.textContent).toContain("Send feedback");
    expect(container.textContent).not.toContain("Quick ask");
  });

  it("shows no Quick ask row, and says why in the console, when the keys can't be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const settings = askKeys({ shortcut: "control+alt+Space", state: "on" });
    settings.keys.mockRejectedValueOnce(new Error("no shell"));
    const container = await showKeyboard(settings);

    expect(container.textContent).not.toContain("Quick ask");
    expect(error).toHaveBeenCalledWith("Quick ask's keys couldn't be read:", expect.any(Error));
  });
});
