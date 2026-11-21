// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AgentsHost } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { buttonNamed, openDialogsInJsdom, show, unmount } from "../test-support.tsx";
import { configurationWords } from "./configuration-words.ts";
import { WhereItRuns } from "./where-it-runs.tsx";

const words = configurationWords.whereItRuns;
const ref = { hubId: "acme", id: "writer" };

beforeAll(openDialogsInJsdom);
afterEach(unmount);

function agentsHost(
  options: { placement?: boolean; unsaved?: () => boolean; studioStartsUnfenced?: boolean } = {},
) {
  return memoryAgentsHost({
    hubs: [{ id: "acme", name: "Acme" }],
    agents: [{ ...ref, name: "Writer", harness: "claude-code" }],
    ...options,
  });
}

async function open(host: AgentsHost) {
  return show(<WhereItRuns host={host} settings={await host.settings(ref)} />);
}

function radioNamed(page: HTMLElement, name: string) {
  return [...page.querySelectorAll<HTMLInputElement>("input[type=radio]")].find(
    (input) =>
      document.getElementById(input.getAttribute("aria-labelledby") ?? "")?.textContent === name,
  );
}

/** The open warning, or `undefined`. */
function warning() {
  return document.querySelector<HTMLDialogElement>("dialog[open]") ?? undefined;
}

async function press(button: HTMLElement | undefined) {
  if (button === undefined) throw new Error("no such button");
  await act(async () => button.click());
}

/** Waits a frame: the warning's alert slot fills a frame after the request ends. */
async function nextFrame() {
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

/** Picks On this computer and confirms the warning, as a person does. */
async function chooseThisComputer(page: HTMLElement) {
  await press(radioNamed(page, words.onThisComputer));
  await press(buttonNamed(document.body, words.confirm));
}

verifies("agents.configuration.where-it-runs", () => {
  describe("Where it runs", () => {
    it("starts in a sandbox", async () => {
      const page = await open(agentsHost());
      expect(radioNamed(page, words.inSandbox)?.checked).toBe(true);
      expect(page.textContent).not.toContain(words.reviewAndConfirm);
    });

    it("warns before On this computer, with Cancel focused, and saves nothing on Cancel", async () => {
      const host = agentsHost();
      const page = await open(host);
      await press(radioNamed(page, words.onThisComputer));
      const dialog = warning();
      expect(dialog?.textContent).toContain(words.warningTitle("Writer"));
      expect(dialog?.textContent).toContain(words.warningAccess("Writer"));
      expect(dialog?.textContent).toContain(words.warningTrust("Writer"));
      expect(document.activeElement?.textContent).toBe(words.cancel);
      expect(buttonNamed(document.body, words.confirm)?.className).toContain("danger");
      await press(buttonNamed(document.body, words.cancel));
      expect(warning()).toBeUndefined();
      expect(radioNamed(page, words.inSandbox)?.checked).toBe(true);
      expect((await host.placement(ref))?.runsOn).toBe("sandbox");
    });

    it("saves On this computer once the person confirms", async () => {
      const host = agentsHost();
      const page = await open(host);
      await chooseThisComputer(page);
      expect(warning()).toBeUndefined();
      expect(radioNamed(page, words.onThisComputer)?.checked).toBe(true);
      expect((await host.placement(ref))?.runsOn).toBe("this-computer");
    });

    // Julian's condition (J): a changed file stops the choice until the person confirms again.
    it("holds the choice when the file changes, until the person reviews and confirms", async () => {
      const host = agentsHost();
      const page = await open(host);
      await chooseThisComputer(page);
      await act(async () => host.update(ref, { instructions: "Reply to everyone." }));
      expect(page.textContent).toContain(words.onHold("Writer"));
      expect(radioNamed(page, words.onThisComputer)?.checked).toBe(true);
      expect((await host.placement(ref))?.runsOn).toBe("on-hold");

      await press(buttonNamed(page, words.reviewAndConfirm));
      expect(warning()?.textContent).toContain(words.warningTitle("Writer"));
      await press(buttonNamed(document.body, words.confirm));
      expect(page.textContent).not.toContain(words.onHold("Writer"));
      expect((await host.placement(ref))?.runsOn).toBe("this-computer");
    });

    it("saves nothing when the file changes while the warning is open, and warns again", async () => {
      const host = agentsHost();
      const page = await open(host);
      await press(radioNamed(page, words.onThisComputer));
      await act(async () => host.update(ref, { instructions: "Changed meanwhile." }));
      await press(buttonNamed(document.body, words.confirm));
      await nextFrame();
      expect(warning()?.textContent).toContain(words.changedWhileOpen("Writer"));
      expect((await host.placement(ref))?.runsOn).toBe("sandbox");

      await press(buttonNamed(document.body, words.confirm));
      expect(warning()).toBeUndefined();
      expect((await host.placement(ref))?.runsOn).toBe("this-computer");
    });

    it("goes back to the sandbox at once, without a warning", async () => {
      const host = agentsHost();
      const page = await open(host);
      await chooseThisComputer(page);
      await press(radioNamed(page, words.inSandbox));
      expect(warning()).toBeUndefined();
      expect(radioNamed(page, words.inSandbox)?.checked).toBe(true);
      expect((await host.placement(ref))?.runsOn).toBe("sandbox");
    });

    // Julian's HAL-13201 review: the choice is for the saved file, which `halonic run` runs.
    it("asks to save first while the agent's file has unsaved changes", async () => {
      const host = agentsHost({ unsaved: () => true });
      const page = await open(host);
      await press(radioNamed(page, words.onThisComputer));
      expect(warning()?.textContent).toContain(words.saveFirst("Writer"));
      const confirm = buttonNamed(document.body, words.confirm);
      expect(confirm?.getAttribute("aria-disabled")).toBe("true");
      // Sofia (HAL-13232): a screen reader hears why the button is unavailable.
      const reason = document.getElementById(confirm?.getAttribute("aria-describedby") ?? "");
      expect(reason?.textContent).toBe(words.saveFirst("Writer"));
      await press(confirm);
      expect((await host.placement(ref))?.runsOn).toBe("sandbox");
    });

    // Liam's condition 4 (HAL-13194): the hint follows what the host reports.
    it("says under On this computer that Studio can't start it, only while the host says so", async () => {
      const cant = await open(agentsHost());
      expect(cant.textContent).toContain(words.studioCantStart);
      unmount();
      const can = await open(agentsHost({ studioStartsUnfenced: true }));
      expect(can.textContent).toContain(words.onThisComputerNote);
      expect(can.textContent).not.toContain(words.studioCantStart);
    });

    it("says why it can't read the choice, and reads it again on Try again", async () => {
      const memory = agentsHost();
      let readable = false;
      const host: AgentsHost = {
        ...memory,
        placement: async (asked) => {
          if (!readable) throw new Error("The agent host isn't answering.");
          return memory.placement(asked);
        },
      };
      const page = await open(host);
      expect(page.textContent).toContain(words.couldntRead("The agent host isn't answering."));
      readable = true;
      await press(buttonNamed(page, configurationWords.tryAgain));
      expect(radioNamed(page, words.inSandbox)?.checked).toBe(true);
    });

    it("isn't drawn where Studio can't choose where agents run", async () => {
      const page = await open(agentsHost({ placement: false }));
      expect(page.textContent).toBe("");
    });
  });
});
