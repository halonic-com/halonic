// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { FeedbackSettingsHost } from "../api.ts";
import { feedbackPrefs } from "../feedback-prefs.ts";
import { FeedbackView } from "./feedback-section.tsx";
import { memorySettings, render, settle, unmountAll } from "./test-support.tsx";

afterEach(unmountAll);

const host = (waiting?: number): FeedbackSettingsHost => ({
  platform: "windows",
  setShortcut: async () => "saved",
  ...(waiting === undefined ? {} : { waiting: async () => waiting }),
});

/** The text field labelled `label`. */
function field(container: HTMLElement, label: string): HTMLInputElement {
  const labelled = [...container.querySelectorAll("label")].find((each) =>
    each.textContent?.includes(label),
  );
  const input = container.querySelector<HTMLInputElement>(
    `#${CSS.escape(labelled?.htmlFor ?? "")}`,
  );
  if (input === null) throw new Error(`No field "${label}".`);
  return input;
}

/** Types `text` into `input` as React hears it, then leaves the field. */
async function typeAndLeave(input: HTMLInputElement, text: string) {
  act(() => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setValue?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.focus();
    input.blur();
  });
  await settle();
}

verifies("feedback.settings-section", () => {
  it("shows Project and Assign to with their defaults, and no waiting line", async () => {
    const { settings } = await memorySettings();
    const container = render(
      <FeedbackView host={host()} settings={settings} announce={() => undefined} />,
    );
    await settle();

    expect(field(container, "Project").value).toBe("Halonic apps");
    expect(field(container, "Assign to").value).toBe("Chief");
    expect(container.textContent).not.toContain("waiting to send");
  });

  it("says how many feedbacks wait to be sent", async () => {
    const { settings } = await memorySettings();
    const container = render(
      <FeedbackView host={host(3)} settings={settings} announce={() => undefined} />,
    );
    await settle();

    expect(container.textContent).toContain("3 waiting to send");
  });

  it("saves a project when the person leaves the field, and puts an emptied one back", async () => {
    const { settings, store } = await memorySettings();
    const container = render(
      <FeedbackView host={host()} settings={settings} announce={() => undefined} />,
    );

    await typeAndLeave(field(container, "Project"), "  Acme apps ");
    expect(store.stored.get(feedbackPrefs.project.key)).toBe("Acme apps");

    await typeAndLeave(field(container, "Project"), "");
    expect(store.stored.has(feedbackPrefs.project.key)).toBe(false);
    expect(field(container, "Project").value).toBe("Halonic apps");
  });

  it("says a failed save under the field and in the dialog", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { settings, store } = await memorySettings({ "feedback.assignee": "Chief" });
    store.failSaves = true;
    const announced: string[] = [];
    const container = render(
      <FeedbackView host={host()} settings={settings} announce={(l) => announced.push(l)} />,
    );

    await typeAndLeave(field(container, "Assign to"), "Acme lead");

    const line = `Couldn't save "Assign to" on this computer.`;
    expect(container.textContent).toContain(line);
    expect(announced).toEqual([line]);
  });
});
