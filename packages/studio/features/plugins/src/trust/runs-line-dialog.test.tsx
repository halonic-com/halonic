// @vitest-environment jsdom

import type { RunnerUnfencedReason } from "@halonicjs/app";
import { type Plugin, parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { PluginTrustDialog } from "./plugin-trust-dialog.tsx";
import type { TrustFence, UnfencedYes } from "./runs-line.ts";
import { TRUST_CHECK_LAST_LINE } from "./trust-text.ts";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

function plugin(yaml: string): Plugin {
  const parsed = parseFile("plugin", yaml);
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  return parsed.value.value;
}

const weather = plugin(`id: weather
version: 1.2.0
sdk: 1
name: Weather
backend:
  hosts: [api.example.com]
  tools:
    - { name: forecast, description: The forecast., risk: read, untrusted: false }
localTools:
  - id: radar
    start: { package: { runner: npx, name: weather-mcp, version: 1.2.3 } }
    network: [radar.example.com]
    tools:
      - { name: radar, description: The radar., risk: read, untrusted: false }`);

const radarOnly = plugin(`id: radar
version: 0.1.0
sdk: 1
name: Radar
localTools:
  - id: radar
    start: { package: { runner: npx, name: radar-mcp, version: 2.0.0 } }
    network: [radar.example.com]
    tools:
      - { name: radar, description: The radar., risk: read, untrusted: false }`);

const windows = { state: "not-fenced", reason: "windows" } as const;
const checkbox = "I understand plugins and integrations run without the sandbox on this computer";

function open(
  manifest: Plugin,
  fence: TrustFence,
  unfencedYes?: UnfencedYes,
): (RunnerUnfencedReason | undefined)[] {
  const trusted: (RunnerUnfencedReason | undefined)[] = [];
  render(
    <PluginTrustDialog
      manifest={manifest}
      origin={undefined}
      reason="add"
      fence={fence}
      unfencedYes={unfencedYes}
      onTrust={(allow) => trusted.push(allow)}
      onNotNow={() => undefined}
    />,
  );
  return trusted;
}

function dialog(): HTMLDialogElement {
  const found = document.querySelector("dialog");
  if (found === null) throw new Error("No dialog");
  return found;
}

function trustButton(): HTMLButtonElement {
  const found = [...dialog().querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.startsWith("Trust and turn on"),
  );
  if (found === undefined) throw new Error("No Trust button");
  return found;
}

/** The footnote: the last `<p>` before the footer, outside the body. */
function lastLine(): HTMLElement {
  const footer = dialog().querySelector("footer");
  const line = footer?.previousElementSibling?.lastElementChild;
  if (!(line instanceof HTMLElement)) throw new Error("No last line");
  return line;
}

function box(): HTMLInputElement | null {
  return dialog().querySelector('input[type="checkbox"]');
}

/** The element holding a text, the deepest one that starts with it. */
function textNode(within: HTMLElement, start: string): HTMLElement | null {
  const all = [...within.querySelectorAll<HTMLElement>("*")];
  return all.findLast((element) => element.textContent?.startsWith(start) === true) ?? null;
}

/** Whether `first` comes before `second` in the DOM, the order Tab and a screen reader follow. */
function precedes(first: Element | null, second: Element | null): boolean {
  if (first === null || second === null) return false;
  return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/** Whether a section is open, by its row. */
function isOpen(row: string): boolean | undefined {
  return [...dialog().querySelectorAll("details")].find((details) =>
    details.querySelector("summary")?.textContent?.startsWith(row),
  )?.open;
}

verifies("plugins.plugin-trust-runs-line", () => {
  it("shows the board's longer line and R7 in the sandbox, with no checkbox", () => {
    open(weather, { state: "fenced" });

    expect(lastLine().textContent).toBe(
      "Plugin code runs apart from Studio and your files, and can only reach the addresses above. Its program runs in the agent sandbox. Halonic doesn't check what the plugin does with what it's given.",
    );
    expect(dialog().textContent).toContain("The only addresses this plugin can reach.");
    expect(box()).toBeNull();
    expect(trustButton().getAttribute("aria-disabled")).not.toBe("true");
  });

  describe("not in the sandbox, not yet allowed", () => {
    it("shows the amber line with the triangle, the reason, the fix and the docs link, then the sentence that's always true", () => {
      open(weather, windows);

      const line = lastLine();
      expect(line.textContent).toBe(
        "Plugin code runs apart from Studio, but not in the sandbox on this computer, so it may be able to use your files, programs and sign-ins, and reach addresses not listed above." +
          "On Windows, plugin code can't run in the sandbox in this version of Halonic. Use Halonic inside WSL 2 on this computer. How to run Halonic in WSL 2 ↗ (opens in your browser)" +
          "Halonic doesn't check what the plugin does with what it's given." +
          checkbox,
      );
      expect(line.querySelector(".text-attention svg")).not.toBeNull();
      expect(line.querySelector("a")?.getAttribute("href")).toBe(
        "https://docs.halonic.dev/security/sandbox/#windows-preview",
      );
      expect(dialog().textContent).toContain(
        "Addresses this plugin names. Without the sandbox, its code may connect elsewhere.",
      );
      expect(isOpen("Programs")).toBe(true);
    });

    it("keeps Trust unavailable but focusable until the box is ticked, then passes the reason", () => {
      const trusted = open(weather, windows);

      const trust = trustButton();
      expect(dialog().textContent).toContain(checkbox);
      expect(trust.getAttribute("aria-disabled")).toBe("true");
      expect(trust.disabled).toBe(false);
      const described = document.getElementById(trust.getAttribute("aria-describedby") ?? "");
      expect(described?.textContent).toBe(checkbox);
      act(() => trust.click());
      expect(trusted).toEqual([]);

      act(() => box()?.click());
      expect(trustButton().getAttribute("aria-disabled")).not.toBe("true");
      act(() => trustButton().click());
      expect(trusted).toEqual(["windows"]);
    });

    it("puts the checkbox after the words it confirms, last before the buttons, for Tab too (RL1)", () => {
      open(weather, windows);

      const line = lastLine();
      const input = box();
      if (input === null) throw new Error("No checkbox");
      // The footnote is the last thing above the footer; the checkbox is its last part.
      expect(line.lastElementChild?.contains(input)).toBe(true);
      expect(precedes(textNode(line, "Halonic doesn't check"), input)).toBe(true);
      const tabOrder = [...dialog().querySelectorAll<HTMLElement>("summary, a, input, button")];
      const at = tabOrder.indexOf(input);
      expect(tabOrder[at - 1]).toBe(line.querySelector("a"));
      expect(tabOrder[at + 1]?.textContent).toBe("Not now");
    });
  });

  it("shows the saved yes inside the warning, after the docs link and before the last sentence (R6, RL1)", () => {
    open(weather, windows, { reason: "windows", on: "9 Nov" });

    const line = lastLine();
    const allowed = textNode(line, "You allowed");
    expect(precedes(line.querySelector("a"), allowed)).toBe(true);
    expect(precedes(allowed, textNode(line, "Halonic doesn't check"))).toBe(true);
    expect(line.lastElementChild?.textContent).toBe(
      "Halonic doesn't check what the plugin does with what it's given.",
    );
  });

  it("shows the saved yes instead of the checkbox once allowed for this reason (R6)", () => {
    const trusted = open(weather, windows, { reason: "windows", on: "9 Nov" });

    expect(box()).toBeNull();
    expect(dialog().textContent).toContain(
      "You allowed plugins and integrations to run without the sandbox on this computer on 9 Nov, for this reason.",
    );
    expect(lastLine().textContent).toContain("not in the sandbox on this computer");
    act(() => trustButton().click());
    expect(trusted).toEqual([undefined]);
  });

  it("asks again when the saved yes was for another reason", () => {
    open(weather, { state: "not-fenced", reason: "container" }, { reason: "windows", on: "9 Nov" });

    expect(dialog().textContent).toContain(checkbox);
    expect(lastLine().textContent).toContain(
      "Halonic is running inside a container, and the sandbox can't start there.",
    );
  });

  it("gives a plugin with only programs the short line and no checkbox", () => {
    open(radarOnly, windows);

    expect(lastLine().textContent).toBe(TRUST_CHECK_LAST_LINE);
    expect(box()).toBeNull();
    expect(trustButton().getAttribute("aria-disabled")).not.toBe("true");
  });

  it("says it's checking, keeps T9 and keeps Trust unavailable while the status is read (R4)", () => {
    const trusted = open(weather, { state: "checking" });

    expect(dialog().textContent).toContain("Checking the sandbox on this computer…");
    expect(lastLine().textContent).toBe(TRUST_CHECK_LAST_LINE);
    expect(trustButton().getAttribute("aria-disabled")).toBe("true");
    act(() => trustButton().click());
    expect(trusted).toEqual([]);
  });

  it("keeps T9 and asks nothing when the host doesn't say", () => {
    open(weather, undefined);

    expect(lastLine().textContent).toBe(TRUST_CHECK_LAST_LINE);
    expect(box()).toBeNull();
    expect(dialog().textContent).not.toContain("The only addresses this plugin can reach.");
  });
});
