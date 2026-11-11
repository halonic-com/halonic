// @vitest-environment jsdom

import { parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { act, Fragment, StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import {
  type PluginCommand,
  type PluginCommandArgs,
  PluginCommandDialog,
  type PluginToolCaller,
} from "./plugin-command-dialog.tsx";
import { timedToolCaller } from "./tool-call-timeout.ts";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

/** The commands of a weather plugin, parsed by the real `plugin` kind. */
function commandsFrom(commands: string): PluginCommand[] {
  const parsed = parseFile(
    "plugin",
    `id: weather
version: 1.2.0
sdk: 1
name: Weather
backend:
  hosts: [api.example.com]
  tools:
    - { name: forecast, description: The forecast., risk: read, untrusted: true }
    - { name: today, description: Today's weather., risk: read, untrusted: true }
ui:
  commands:
${commands}`,
  );
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  return parsed.value.value.ui?.commands ?? [];
}

const [forecast, today] = commandsFrom(`    - id: forecast
      title: Show the forecast
      tool: forecast
      form:
        place: { label: Place, type: text, required: true }
        days: { label: Days, type: number }
        units: { label: Units, type: choice, choices: [metric, imperial], default: metric }
        hourly: { label: Hour by hour, type: boolean }
      show: markdown
    - id: today
      title: Delete everything
      tool: today`) as [PluginCommand, PluginCommand];

interface Call {
  readonly plugin: string;
  readonly tool: string;
  readonly args: PluginCommandArgs;
}

/** A tool caller that answers with each answer in turn; an Error is thrown. */
function callerAnswering(...answers: (string | Error)[]) {
  const calls: Call[] = [];
  const caller: PluginToolCaller = {
    call: async (plugin, tool, args) => {
      calls.push({ plugin, tool, args });
      const answer = answers.shift() ?? "";
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
  return { caller, calls };
}

function open(command: PluginCommand, caller: PluginToolCaller, strict = false) {
  let closed = 0;
  const Wrap = strict ? StrictMode : Fragment;
  render(
    <Wrap>
      <PluginCommandDialog
        plugin={{ id: "weather", name: "Weather" }}
        command={command}
        caller={caller}
        onClose={() => {
          closed += 1;
        }}
      />
    </Wrap>,
  );
  return { closed: () => closed };
}

/** Lets the call answer, then a frame pass, as the Dialog's alert slot waits for one. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

function dialog(): HTMLDialogElement {
  const found = document.querySelector("dialog");
  if (found === null) throw new Error("No dialog");
  return found;
}

/** A button's words. The confirming one also holds its busy words, hidden until it's busy. */
function wordsOf(found: HTMLButtonElement): string {
  return (found.textContent ?? "").replace(/Running…$/u, "").trim();
}

function button(name: string): HTMLButtonElement {
  const found = [...dialog().querySelectorAll("button")].find(
    (candidate) => wordsOf(candidate) === name,
  );
  if (found === undefined) throw new Error(`No button ${name}`);
  return found;
}

function buttonWords(): string[] {
  return [...dialog().querySelectorAll("button")].map(wordsOf);
}

function fieldNamed(label: string): HTMLInputElement | HTMLSelectElement {
  const labelElement = [...dialog().querySelectorAll("label")].find(
    (candidate) => candidate.textContent?.replace(/Required$/u, "").trim() === label,
  );
  const id = labelElement?.getAttribute("for");
  const field = id === null || id === undefined ? null : document.getElementById(id);
  if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) return field;
  throw new Error(`No field called ${label}`);
}

function type(input: HTMLInputElement | HTMLSelectElement, text: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setValue?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function lineUnder(input: Element): string {
  const ids = input.getAttribute("aria-describedby")?.split(" ") ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
}

async function press(name: string) {
  act(() => button(name).click());
  await settle();
}

verifies("plugins.plugin-commands", () => {
  it("shows the title, where it comes from, the form, and Halonic's own buttons", () => {
    open(forecast, callerAnswering().caller);
    expect(dialog().textContent).toContain("Show the forecast");
    expect(dialog().textContent).toContain(
      "From the Weather plugin · uses the tool forecast, which reads",
    );
    expect(dialog().querySelector("code")?.textContent).toBe("forecast");
    expect(fieldNamed("Place")).toBeInstanceOf(HTMLInputElement);
    expect(fieldNamed("Units").value).toBe("metric");
    expect(dialog().textContent).toContain("Hour by hour");
    expect(buttonWords()).toEqual(expect.arrayContaining(["Cancel", "Run command"]));
  });

  it("says what to do under each field it can't send, focuses the first and calls nothing", async () => {
    const { caller, calls } = callerAnswering("sunny");
    open(forecast, caller);
    type(fieldNamed("Days"), "three");
    await press("Run command");
    expect(lineUnder(fieldNamed("Place"))).toBe("Fill this in.");
    expect(lineUnder(fieldNamed("Days"))).toContain("Use a number.");
    expect(document.activeElement).toBe(fieldNamed("Place"));
    expect(calls).toEqual([]);
  });

  it("calls the tool with the form's values and shows the answer in a Result box with Copy", async () => {
    const { caller, calls } = callerAnswering("**Sunny**, 21°", "Rain");
    open(forecast, caller);
    type(fieldNamed("Place"), "Ghent");
    type(fieldNamed("Days"), "3");
    await press("Run command");
    expect(calls).toEqual([
      {
        plugin: "weather",
        tool: "forecast",
        args: { place: "Ghent", days: 3, units: "metric", hourly: false },
      },
    ]);
    const result = dialog().querySelector("section");
    expect(result?.querySelector("h3")?.textContent).toBe("Result");
    expect(document.activeElement).toBe(result?.querySelector("h3"));
    expect(result?.querySelector("strong")?.textContent).toBe("Sunny");
    expect(result?.querySelector('button[aria-label="Copy the result"]')).not.toBeNull();
    expect(buttonWords()).toEqual(expect.arrayContaining(["Close", "Run again"]));
    expect(buttonWords()).not.toContain("Run command");

    await press("Run again");
    expect(calls).toHaveLength(2);
    expect(dialog().querySelector("section")?.textContent).toContain("Rain");
  });

  it("says the call failed with Try again, and keeps what was typed", async () => {
    const { caller, calls } = callerAnswering(new Error("the service didn't answer."), "Sunny");
    open(forecast, caller);
    type(fieldNamed("Place"), "Ghent");
    await press("Run command");
    expect(dialog().textContent).toContain(
      "Couldn't run Show the forecast: the service didn't answer.",
    );
    expect(fieldNamed("Place").value).toBe("Ghent");
    await press("Try again");
    expect(calls).toHaveLength(2);
    expect(dialog().textContent).not.toContain("Couldn't run");
  });

  it("runs a command without a form at once, under Halonic's button words", async () => {
    const { caller, calls } = callerAnswering("<b>Done</b>");
    const opened = open(today, caller);
    await settle();
    expect(calls).toEqual([{ plugin: "weather", tool: "today", args: {} }]);
    expect(dialog().textContent).toContain("Delete everything");
    expect(dialog().querySelector("b")).toBeNull();
    expect(dialog().querySelector("section")?.textContent).toContain("<b>Done</b>");
    await press("Close");
    expect(opened.closed()).toBe(1);
  });

  it("keeps Run command for a command called Delete everything that has a form", () => {
    const [named] = commandsFrom(`    - id: wipe
      title: Delete everything
      tool: forecast
      form:
        place: { label: Place, type: text }`);
    open(named as PluginCommand, callerAnswering().caller);
    expect(buttonWords()).toContain("Run command");
    expect(buttonWords()).not.toContain("Delete everything");
  });
});

verifies("plugins.palette-commands", () => {
  it("runs a command without a form once mounted in StrictMode, and shows its answer", async () => {
    const { caller } = callerAnswering("Sunny", "Sunny");
    open(today, caller, true);
    await settle();
    expect(dialog().querySelector("section")?.textContent).toContain("Sunny");
    expect(buttonWords()).toContain("Close");
  });

  it("fails a call the tool doesn't answer in 30 seconds, with Try again", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const never: PluginToolCaller = { call: () => new Promise<string>(() => {}) };
      open(forecast, timedToolCaller(never));
      type(fieldNamed("Place"), "Ghent");
      act(() => button("Run command").click());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
    } finally {
      vi.useRealTimers();
    }
    await settle();
    expect(dialog().textContent).toContain(
      "Couldn't run Show the forecast: the plugin didn't answer in 30 seconds.",
    );
    expect(button("Try again")).toBeDefined();
  });
});
